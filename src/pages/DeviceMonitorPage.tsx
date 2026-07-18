import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronDown, Check, Settings, Bell } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import RealTimePowerChart from '../components/RealTimePowerChart'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime } from '../api/deviceApi'
import { batteryTimeLabel } from '../utils/batteryTime'
import { loadRatedParams } from '../db/powerflowDB'

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

  // Map realtime fields —— 仅当 store 里的实时状态确实属于「当前」设备时才用它。
  // 切换设备时 store 可能仍短暂持有上一台设备的状态，此时返回 null，卡片显示占位
  // 而非上一台设备的数据，直到本设备(id)的状态加载完成。
  const rt = useMemo(() => {
    if (!selectedDeviceState?.fields) return null
    if (id && selectedDeviceState.deviceId && String(selectedDeviceState.deviceId) !== id) return null
    return mapFieldsToRealtime(selectedDeviceState.fields)
  }, [selectedDeviceState, id])

  const remainingBatteryCapacity = rt?.remainingBatteryCapacity ?? 0
  const acPower = rt?.acPower ?? 0
  const solarPower = rt?.solarPower ?? 0
  const outputPower = rt?.outputPower ?? 0
  const batteryPower = rt?.batteryPower ?? 0
  const isCharging = batteryPower > 0
  const isOnline = device?.isOnline ?? true

  // 额定容量（Wh）= acInvOutputPower × 2，与 Device Info 页 Rated Capacity 同源
  const [batteryCapacityWh, setBatteryCapacityWh] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!id) { setBatteryCapacityWh(undefined); return }
    loadRatedParams(id)
      .then(p => setBatteryCapacityWh(p ? p.acInvOutputPower * 2 : undefined))
      .catch(() => setBatteryCapacityWh(undefined))
  }, [id])

  // 统一口径：电池剩余/充满时间（见 utils/batteryTime）
  const timeStr = batteryTimeLabel({
    acPower, solarPower, outputPower,
    soc: remainingBatteryCapacity,
    capacityWh: batteryCapacityWh,
    isCharging,
  })

  const fmtW = (w: number) => Math.abs(Math.round(w))

  return (
    <div
      className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={backToDevices}
          className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>

        {/* Device name + dropdown */}
        <div className="flex-1 flex flex-col items-center relative">
          <button
            onClick={() => setShowDeviceDropdown(v => !v)}
            className="flex flex-col items-center active:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-1">
              <span className="text-title-md font-semibold text-white">
                {device?.name ?? 'Device'}
              </span>
              <ChevronDown
                size={16}
                className={`text-white transition-transform duration-200 ${showDeviceDropdown ? 'rotate-180' : ''}`}
              />
            </div>
            <span className="text-label text-primary">
              {isOnline ? 'Connected' : 'Offline'}
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
                    }}
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/device/${id}/settings`)}
            className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Settings size={18} className="text-white" />
          </button>
          <button
            onClick={() => navigate('/notifications')}
            className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Bell size={18} className="text-white" />
            {device?.isAlarmed && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-danger border-2 border-ink-12" />
            )}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-6 space-y-3">
        {/* ─── SoC Card ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-ink-10 rounded-l p-5"
        >
          {/* Ring */}
          <div className="flex justify-center mb-5">
            <BatteryRing
              percentage={remainingBatteryCapacity}
              size={180}
              strokeWidth={12}
              isCharging={isCharging}
              connected={isOnline}
              timeRemaining={timeStr}
              timeToFull={timeStr}
              rawTimeLabel
            />
          </div>

          {/* Input / Output row — three equal-size value cards */}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <p className="text-label text-ink-6 flex-1">Input</p>
              <span className="w-4 flex-shrink-0" />
              <p className="text-label text-ink-6 flex-1 text-right">Output</p>
            </div>
            <div className="grid grid-cols-[1fr_16px_1fr_1fr] gap-2 items-stretch">
              <div className="bg-ink-11 rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white tnum">{fmtW(acPower)}</span>
                  <span className="text-label text-ink-6">w</span>
                </div>
                <p className="text-tiny text-ink-7 mt-0.5">AC</p>
              </div>
              <span className="text-ink-7 text-body-md font-semibold self-center text-center">+</span>
              <div className="bg-ink-11 rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white tnum">{fmtW(solarPower)}</span>
                  <span className="text-label text-ink-6">w</span>
                </div>
                <p className="text-tiny text-ink-7 mt-0.5">Solar</p>
              </div>
              <div className="bg-ink-11 rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white tnum">{fmtW(outputPower)}</span>
                  <span className="text-label text-ink-6">w</span>
                </div>
                <p className="text-tiny text-ink-7 mt-0.5">AC</p>
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
            lastSyncAt={selectedDeviceState?.time ? new Date(selectedDeviceState.time).getTime() : undefined}
          />
        </motion.div>
      </div>
    </div>
  )
}
