import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PageHeaderShell, HeaderIconButton } from '../components/PageHeader'
import PullToRefresh from '../components/PullToRefresh'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import Icon from '../components/Icon'
import RealTimePowerChart from '../components/RealTimePowerChart'
import { useDeviceStore } from '../stores/deviceStore'
import { useActiveAlarmCount } from '../hooks/useActiveAlarmCount'
import { mapFieldsToRealtime, passthroughDevice } from '../api/deviceApi'
import { FRAMES, decodePassthroughBase64, decodeLiveStatus, type LiveStatus } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { batteryTimeLabel } from '../utils/batteryTime'
import { loadRatedParams } from '../db/powerflowDB'
import { SIERRO_MODELS, type SierroModel } from '../data/deviceModels'
import { useBleLiveStatusStore, lookupBleLiveStatus, mergeCloudWithBle } from '../stores/bleLiveStatusStore'

/**
 * /state/latest 的 `time` 是「Unix 秒的字串」（见 demoData.getDemoDeviceState），
 * 直接丢给 `new Date('1755705600')` 会得到 Invalid Date → NaN。这里容错解析：
 * 纯数字按 epoch 处理（>=13 位当毫秒，否则当秒 *1000），其余按 ISO 字串解析。
 * 返回毫秒时间戳；无法解析时返回 undefined。
 */
function parseDeviceStateTime(time: string | undefined): number | undefined {
  if (!time) return undefined
  if (/^\d+$/.test(time)) {
    const n = Number(time)
    return time.length >= 13 ? n : n * 1000
  }
  const ms = new Date(time).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeviceMonitorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // ─── 返回始终回到 Device 列表页（不回退到任意历史页）───
  const backToDevices = useCallback(() => {
    navigate('/devices', { replace: true })
  }, [navigate])

  // 拦截浏览器/系统返回手势 → 回到 Device 列表页
  useEffect(() => {
    const guardedHref = window.location.href
    window.history.pushState(null, '', guardedHref)
    // 只有 popstate 触发时地址仍停留在本页，才是真实的返回手势（弹出的是我们
    // 自己占位的历史项）。若地址已经变了（例如推送通知深链等外部导航触发的
    // 派生 popstate），说明不是用户返回手势，交给路由正常处理，不要抢先跳转。
    const onPopState = () => {
      if (window.location.href === guardedHref) backToDevices()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [backToDevices])

  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)

  const {
    devices,
    selectedDeviceState,
    selectDevice,
    loadDeviceState,
  } = useDeviceStore()
  // Same count Notifications shows under Active Now, so the dot cannot outlive
  // the list it opens.
  const activeAlarmCount = useActiveAlarmCount()

  const device = devices.find(d => String(d.id) === id)

  // Select this device and load its state（selectDevice 内部已会 loadDeviceState，
  // 无需再单独调用，避免同一设备重复请求）
  useEffect(() => {
    if (!id) return
    selectDevice(id)
  }, [id])

  // 每 30 秒轮询设备实时状态（与 Overview 一致）
  useEffect(() => {
    if (!id) return
    const timer = setInterval(() => loadDeviceState(id), 30000)
    return () => clearInterval(timer)
  }, [id, loadDeviceState])

  // Pass-through polling for the ring + the Input/AC/Solar/Output boxes beside it.
  // The cloud state above refreshes slowly (30s) and lags real hardware; the same
  // READ_ALL_STATUS pass-through frame the device list uses gives a live read of
  // SOC / AC / Solar / Output / battery power. Read once on enter, then every 5s
  // while the page stays mounted, and tear the timer down on leave so nothing
  // keeps polling in the background.
  const [ptLive, setPtLive] = useState<LiveStatus | null>(null)
  // Latest selected id, so a pass-through response that lands after the user has
  // switched devices (or left) is dropped instead of painting a stale reading.
  const currentIdRef = useRef(id)
  currentIdRef.current = id
  const readPassthrough = useCallback(async () => {
    const reqId = id
    if (!reqId || useDeviceStore.getState().isDemoMode) return
    try {
      const res = await passthroughDevice(reqId, { data: FRAMES.READ_ALL_STATUS })
      if (currentIdRef.current !== reqId || !isApiSuccess(res.code)) return
      const b64 = res.data?.base64Output ?? res.data?.content ?? res.data?.data
      const registers = decodePassthroughBase64(b64, 8)
      if (!registers) return
      if (currentIdRef.current === reqId) setPtLive(decodeLiveStatus(registers))
    } catch {
      // pass-through can fail silently; the cloud state remains the fallback
    }
  }, [id])
  useEffect(() => {
    setPtLive(null)
    if (!id) return
    if (useDeviceStore.getState().isDemoMode) return
    readPassthrough()
    const timer = setInterval(readPassthrough, 5000)
    return () => clearInterval(timer)
  }, [id, readPassthrough])

  // Pull-to-refresh: run the same live pass-through read the 5s poller uses AND
  // refresh the cloud device state, in parallel. The mounted 5s interval keeps
  // ticking; this is an on-demand extra read, and the poller's teardown on leave
  // is untouched.
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      readPassthrough(),
      id ? loadDeviceState(id) : Promise.resolve(),
    ])
  }, [readPassthrough, id, loadDeviceState])

  // Map realtime fields —— 仅当 store 里的实时状态确实属于「当前」设备时才用它。
  // 切换设备时 store 可能仍短暂持有上一台设备的状态，此时返回 null，卡片显示占位
  // 而非上一台设备的数据，直到本设备(id)的状态加载完成。
  const bleEpoch = useBleLiveStatusStore(s => s.epoch)
  const rt = useMemo(() => {
    const ble = lookupBleLiveStatus({ deviceId: id })?.live
    const wrongDevice = !!(id && selectedDeviceState?.deviceId && String(selectedDeviceState.deviceId) !== id)
    if (wrongDevice) return ble ? mergeCloudWithBle({}, ble) : null
    if (!selectedDeviceState?.fields) return ble ? mergeCloudWithBle({}, ble) : null
    return mergeCloudWithBle(mapFieldsToRealtime(selectedDeviceState.fields), ble)
  }, [selectedDeviceState, id, bleEpoch])

  // Pass-through (live, 5s) is the primary source for the ring and the Input /
  // AC / Solar / Output boxes — the same source the device list reads — with the
  // slower cloud state as the fallback until the first pass-through read lands.
  const remainingBatteryCapacity = ptLive?.soc ?? rt?.remainingBatteryCapacity ?? null
  const acPower = ptLive?.acPower ?? rt?.acPower ?? 0
  const solarPower = ptLive?.solarPower ?? rt?.solarPower ?? 0
  const outputPower = ptLive?.outputPower ?? rt?.outputPower ?? 0
  const batteryPower = ptLive?.batteryPower ?? rt?.batteryPower ?? 0
  /*
   * The Battery Ring sheet defines the charging state as Input > Output — what
   * is coming in from AC and solar against what the load is drawing — not the
   * sign of batteryPower. The history feed carries no batteryPower field at all
   * (it is derived), so reading the two sides directly is both what the design
   * asks for and the more dependable of the two.
   */
  const isCharging = acPower + solarPower > outputPower
  const isOnline = device?.isOnline ?? true

  // 额定容量（Wh）= acInvOutputPower × 2，与 Device Info 页 Rated Capacity 同源
  const [batteryCapacityWh, setBatteryCapacityWh] = useState<number | undefined>(undefined)
  // The chart's watt axis is the device's rated power, so the model has to be
  // resolved the same way Device Info resolves it — saved rated params first,
  // then whatever the device record carries, then the smaller model.
  const [ratedModel, setRatedModel] = useState<string | null>(null)
  useEffect(() => {
    if (!id) { setBatteryCapacityWh(undefined); setRatedModel(null); return }
    loadRatedParams(id)
      .then(p => {
        setBatteryCapacityWh(p ? p.acInvOutputPower * 2 : undefined)
        setRatedModel(p?.model ?? null)
      })
      .catch(() => { setBatteryCapacityWh(undefined); setRatedModel(null) })
  }, [id])

  const powerAxisMax = useMemo(() => {
    const model = ratedModel ?? device?.model ?? 'Sierro 1000'
    return (SIERRO_MODELS[model as SierroModel] ?? SIERRO_MODELS['Sierro 1000']).ratedPower
  }, [ratedModel, device?.model])

  // 统一口径：电池剩余/充满时间（见 utils/batteryTime）
  const timeStr = batteryTimeLabel({
    acPower, solarPower, outputPower,
    soc: remainingBatteryCapacity ?? 0,
    capacityWh: batteryCapacityWh,
    isCharging,
  })

  const fmtW = (w: number) => Math.abs(Math.round(w))

  return (
    <div
      className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Header */}
      <PageHeaderShell filled className="relative z-20 flex items-center gap-3">
        <HeaderIconButton
          icon="chevron-left"
          label="Back"
          onClick={backToDevices}
          className="flex-shrink-0 before:absolute before:content-[''] before:-inset-1"
        />

        {/* Device name + dropdown. Absolutely centred: the back button on one side
            and the settings + bell pair on the other leave an off-centre gap, and
            B_1.1 centres the name on the frame. */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
          <button
            onClick={() => setShowDeviceDropdown(v => !v)}
            className="flex flex-col items-center active:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-1">
              <span className="text-title-md font-semibold text-white">
                {device?.name ?? 'Device'}
              </span>
              {/* The switcher chevron only earns its place when there is more than
                  one device to switch between; with a single device the dropdown
                  never opens, so the fold marker would just be noise. */}
              {devices.length > 1 && (
                <Icon
                  name="chevron-down"
                  size={20}
                  className={`transition-transform duration-200 ${showDeviceDropdown ? 'rotate-180' : ''}`}
                />
              )}
            </div>
            <span className="text-tiny text-ink-5">
              {isOnline ? 'Connected' : 'Disconnected'}
            </span>
          </button>
          {showDeviceDropdown && devices.length > 1 && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-48 rounded-l bg-ink-10 border border-white/10 shadow-xl overflow-hidden">
              {devices.map(d => {
                const isSelected = String(d.id) === id
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      setShowDeviceDropdown(false)
                      if (!isSelected) navigate(`/device/${d.id}`)
                    }
                    }
                    className="w-full px-4 py-3 flex items-center justify-between border-b border-white/5 last:border-0 active:bg-white/5"
                  >
                    <span className={`text-body-md ${isSelected ? 'text-primary font-semibold' : 'text-white'}`}>
                      {d.name}
                    </span>
                    {isSelected && <Check size={15} className="text-primary" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Settings + Bell */}
        <div className="ml-auto flex items-center gap-3">
          <HeaderIconButton
            icon="setting"
            label="Device settings"
            onClick={() => navigate(`/device/${id}/settings`)}
          />
          <HeaderIconButton
            icon="bell"
            label="Notifications"
            onClick={() => navigate('/notifications')}
          >
            {activeAlarmCount > 0 && (
              <span className="absolute top-px right-px w-2.5 h-2.5 rounded-full bg-danger-dot" />
            )}
          </HeaderIconButton>
        </div>
      </PageHeaderShell>

      {/* Scrollable body — pull down to force an immediate live read + cloud refresh */}
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="px-4 pt-4 pb-6 space-y-4">
        {/* ─── SoC Card ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-ink-10 rounded-l p-5"
        >
          {/* 0907 deck 新樣式 3: ring on the left, Input over Output down the right.
              The ring is fixed at 170 and the column takes the rest, so the two
              input boxes land on the deck's ~64 and nothing overflows on a
              narrower phone. */}
          <div className="flex items-center gap-4">
            <BatteryRing
              percentage={remainingBatteryCapacity}
              size={170}
              strokeWidth={10}
              isCharging={isCharging}
              connected={isOnline}
              timeRemaining={timeStr}
              timeToFull={timeStr}
              rawTimeLabel
            />

            <div className="flex-1 min-w-0">
              <p className="text-caption text-ink-3">Input</p>
              <div className="mt-1 flex items-stretch gap-1.5">
                <div className="flex-1 min-w-0 h-[42px] border-xs border-ink-9 rounded-m text-center flex flex-col items-center justify-center">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-body-lg font-semibold text-white tnum">{fmtW(acPower)}</span>
                    <span className="text-tiny text-ink-5">W</span>
                  </div>
                  <p className="text-tiny text-ink-7">AC</p>
                </div>
                <span className="text-ink-7 text-body-md font-semibold self-center">+</span>
                <div className="flex-1 min-w-0 h-[42px] border-xs border-ink-9 rounded-m text-center flex flex-col items-center justify-center">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-body-lg font-semibold text-white tnum">{fmtW(solarPower)}</span>
                    <span className="text-tiny text-ink-5">W</span>
                  </div>
                  <p className="text-tiny text-ink-7">Solar</p>
                </div>
              </div>

              <p className="mt-3 text-caption text-ink-3">Output</p>
              <div className="mt-1 h-[42px] border-xs border-ink-9 rounded-m text-center flex items-center justify-center">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-body-lg font-semibold text-white tnum">{fmtW(outputPower)}</span>
                  <span className="text-tiny text-ink-5">W</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Real-Time Power Chart Card — shared with Overview ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <RealTimePowerChart
            deviceId={id ?? null}
            isOnline={isOnline}
            values={{ battery: batteryPower, ac: acPower, solar: solarPower, output: outputPower }}
            batteryAsSoc
            batterySoc={remainingBatteryCapacity}
            powerAxisMax={powerAxisMax}
            lastSyncAt={parseDeviceStateTime(selectedDeviceState?.time)}
          />
        </motion.div>
      </div>
      </PullToRefresh>
    </div>
  )
}
