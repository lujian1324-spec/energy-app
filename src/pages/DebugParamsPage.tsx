/**
 * 调试参数页
 * 路由：/device/:id/debug-params
 * 显示本 App 所有 UI 使用的实时参数数值及原始 API 字段
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, RefreshCw, Loader2, History } from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime } from '../api/deviceApi'
import { useHistoryFetcher } from '../hooks/useHistoryFetcher'
import { batteryTimeLabel } from '../utils/batteryTime'
import { loadRatedParams } from '../db/powerflowDB'

// ─── 参数分组描述 ─────────────────────────────────────────────────────────────

interface ParamDef {
  label: string
  key: string
  unit?: string
  fmt?: (v: unknown) => string
}

const fmt1 = (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v ?? '--'))
const fmtBool = (v: unknown) => (v === true || v === 1 || v === '1' ? 'On' : v === false || v === 0 || v === '0' ? 'Off' : '--')
const fmtMode = (v: unknown) => ({ 0: 'Backup', 1: 'Normal', 2: 'Power Saving' }[v as 0|1|2] ?? String(v ?? '--'))

const PARAM_GROUPS: { title: string; color: string; params: ParamDef[] }[] = [
  {
    title: 'Charge / Capacity',
    color: '#01D6BE',
    params: [
      { label: 'SOC (remainingBatteryCapacity)', key: 'remainingBatteryCapacity', unit: '%' },
      { label: 'Battery Capacity (batteryCapacity)', key: 'batteryCapacity', unit: 'Wh' },
      { label: 'Battery Current (batteryCurrent)', key: 'batteryCurrent', unit: 'A', fmt: fmt1 },
      { label: 'Cycle Count (numberOfBatteryUsageCycles)', key: 'numberOfBatteryUsageCycles', unit: 'cycles' },
    ],
  },
  {
    title: 'Power',
    color: '#FFD700',
    params: [
      { label: 'AC Charge Power (exchangeChargingPower)', key: 'acPower', unit: 'W' },
      { label: 'PV Generation Power (generationPower)', key: 'solarPower', unit: 'W' },
      { label: 'Load Output Power (outputPower)', key: 'outputPower', unit: 'W' },
      { label: 'Battery Power (batteryPower)', key: 'batteryPower', unit: 'W' },
    ],
  },
  {
    title: 'Voltage / Frequency',
    color: '#FF9500',
    params: [
      { label: 'AC Input Voltage (l1AcInputVoltage)', key: 'acInputVoltage', unit: 'V', fmt: fmt1 },
      { label: 'AC Input Frequency (acInputFrequency)', key: 'acInputFrequency', unit: 'Hz', fmt: fmt1 },
      { label: 'AC Output Voltage (acOutputVoltage)', key: 'acOutputVoltage', unit: 'V', fmt: fmt1 },
      { label: 'AC Output Frequency (acOutputFrequency)', key: 'acOutputFrequency', unit: 'Hz', fmt: fmt1 },
      { label: 'PV Input Voltage (solarInputVoltage)', key: 'solarInputVoltage', unit: 'V', fmt: fmt1 },
    ],
  },
  {
    title: 'Temperature',
    color: '#FF3530',
    params: [
      { label: 'Cell 1 Temp (cellTemperature1)', key: 'batteryTemp', unit: '℃', fmt: fmt1 },
      { label: 'Cell 2 Temp (cellTemperature2)', key: 'cellTemperature2', unit: '℃', fmt: fmt1 },
      { label: 'Cell 3 Temp (cellTemperature3)', key: 'cellTemperature3', unit: '℃', fmt: fmt1 },
      { label: 'MPPT Temp (mpptTemperature)', key: 'mpptTemperature', unit: '℃', fmt: fmt1 },
      { label: 'DCDC Temp (dcdcTemperature)', key: 'dcdcTemperature', unit: '℃', fmt: fmt1 },
    ],
  },
  {
    title: 'Energy Stats',
    color: '#34C759',
    params: [
      { label: 'Today PV Generation (pvGeneratedEnergyOfDay)', key: 'pvGeneratedEnergyOfDay', unit: 'Wh' },
      { label: 'Total PV Generation (totalPVGeneratedEnergy)', key: 'totalPVGeneratedEnergy', unit: 'Wh' },
      { label: 'Total Charge Time (accumulatedChargingTime)', key: 'accumulatedChargingTime', unit: 'h' },
      { label: 'Total Discharge Time (accumulatedDischargeTime)', key: 'accumulatedDischargeTime', unit: 'h' },
    ],
  },
  {
    title: 'Switch State',
    color: '#8C8C8C',
    params: [
      { label: 'AC Output 1 (inversionState)', key: 'acOut1Enable', fmt: fmtBool },
      { label: 'AC Output 2 (acOut2Enable)', key: 'acOut2Enable', fmt: fmtBool },
      { label: 'USB Output (usbOut1Enable)', key: 'usbOut1Enable', fmt: fmtBool },
      { label: 'PV Charging (photovoltaicCharging)', key: 'photovoltaicCharging', fmt: fmtBool },
      { label: 'AC Charging (mainsCharging)', key: 'mainsCharging', fmt: fmtBool },
      { label: 'AC Outputs (acOutputs)', key: 'acOutputs', fmt: fmtBool },
      { label: 'Bypass (bypassStatus)', key: 'bypassStatus', fmt: fmtBool },
      { label: 'No-Load Shutdown (noLoadShutdown)', key: 'noLoadShutdown', fmt: fmtBool },
      { label: 'Sleep Mode (sleepMode)', key: 'sleepMode', fmt: fmtBool },
    ],
  },
  {
    title: 'Mode / Version',
    color: '#BFBFBF',
    params: [
      { label: 'Work Mode (workMode)', key: 'workMode', fmt: fmtMode },
      { label: 'Hardware Version (hardwareVersion)', key: 'hardwareVersion' },
      { label: 'Main SW Version (softwareVersionNumber)', key: 'softwareVersionNumber' },
      { label: 'Inverter SW Version (inverterSoftwareVersionNumber)', key: 'inverterSoftwareVersionNumber' },
    ],
  },
]

// ─── 主页面 ───────────────────────────────────────────────────────────────────

const TARGET_SN = '2412315001'
const JUN25_FROM = new Date('2026-06-25T00:00:00+08:00').getTime()
const JUN25_TO   = new Date('2026-06-25T23:59:59+08:00').getTime()

export default function DebugParamsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { devices, selectedDeviceState, loadDeviceState, isDemoMode } = useDeviceStore()
  const device = devices.find(d => String(d.id) === id)

  // 额定容量（Wh）= acInvOutputPower × 2，与 batteryTime.ts / Device Info 页同源
  const [batteryCapacityWh, setBatteryCapacityWh] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!id) { setBatteryCapacityWh(undefined); return }
    loadRatedParams(id)
      .then(p => setBatteryCapacityWh(p ? p.acInvOutputPower * 2 : undefined))
      .catch(() => setBatteryCapacityWh(undefined))
  }, [id])

  // ─── 6月25日历史数据（分页拉取，本地缓存） ──────────────────────────────────
  const [showRawHistory, setShowRawHistory] = useState(false)
  const targetDeviceId = useMemo(() => {
    const d = devices.find(d => String(d.serialNumber) === TARGET_SN)
    return d ? String(d.id) : null
  }, [devices])

  const {
    points: historyPoints,
    loading: historyLoading,
    done: historyDone,
    currentPage: historyPage,
    savedCount,
    fromCache: historyFromCache,
    error: historyError,
  } = useHistoryFetcher(targetDeviceId, JUN25_FROM, JUN25_TO)

  const history = useMemo(() => {
    if (historyPoints.length === 0) return null
    const stat = (arr: number[]) => ({
      min: Math.min(...arr),
      max: Math.max(...arr),
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      total: arr.reduce((a, b) => a + b, 0),
    })
    return {
      solar:  stat(historyPoints.map(p => p.solar)),
      output: stat(historyPoints.map(p => p.output)),
      soc:    stat(historyPoints.map(p => p.soc)),
    }
  }, [historyPoints])

  const rt = useMemo(
    () => (selectedDeviceState?.fields ? mapFieldsToRealtime(selectedDeviceState.fields) : null),
    [selectedDeviceState]
  )

  const rawFields = selectedDeviceState?.fields ?? {}
  const updatedAt = selectedDeviceState
    ? new Date().toLocaleTimeString('en-US', { hour12: false })
    : '--'

  const getValue = (param: ParamDef): string => {
    const v = rt?.[param.key as keyof typeof rt]
    if (v === undefined || v === null) return '--'
    if (param.fmt) return param.fmt(v)
    if (typeof v === 'number') return String(v)
    return String(v)
  }

  // ─── UI 界面派生 / 计算参数（与各页面显示逻辑保持一致） ───
  const derivedRows = useMemo(() => {
    const num = (k: string) => {
      const v = rt?.[k as keyof typeof rt]
      return typeof v === 'number' ? v : 0
    }
    const acP = num('acPower')
    const solarP = num('solarPower')
    const outP = num('outputPower')
    const battP = num('batteryPower')
    const soc = num('remainingBatteryCapacity')

    const netChargeW = acP + solarP - outP
    const isCharging = battP > 0

    // 统一口径：容量(Wh) = acInvOutputPower × 2，缺省 1000（见 utils/batteryTime.ts）
    const capacityWh = batteryCapacityWh && batteryCapacityWh > 0 ? batteryCapacityWh : 1000
    const remainingWh = (soc / 100) * capacityWh
    const neededWh = ((100 - soc) / 100) * capacityWh

    // 全 App 统一使用 batteryTimeLabel（Overview / Device Monitor / 此页同一函数）
    const unifiedTime = batteryTimeLabel({
      acPower: acP, solarPower: solarP, outputPower: outP,
      soc, capacityWh: batteryCapacityWh, isCharging,
    })

    return [
      { label: 'Net Charge Power (netChargeW = AC+PV−Output)', value: `${netChargeW} W` },
      { label: 'Charging (isCharging = batteryPower>0)', value: isCharging ? 'Yes' : 'No' },
      { label: 'Rated Capacity (capacityWh = acInvOutputPower×2)', value: `${capacityWh} Wh${batteryCapacityWh ? '' : ' (default)'}` },
      { label: 'Remaining Charge (remainingWh = SOC×Capacity)', value: `${Math.round(remainingWh)} Wh` },
      { label: 'Energy to Full (neededWh = (1−SOC)×Capacity)', value: `${Math.round(neededWh)} Wh` },
      { label: 'Battery Time (batteryTimeLabel — unified)', value: unifiedTime },
      { label: 'Battery Health (batteryHealth, fixed)', value: '100 %' },
    ]
  }, [rt, batteryCapacityWh])

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3 border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-ink-10"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-title-lg font-semibold text-white">Debug Params</h1>
          <p className="text-tiny text-ink-8">{device?.name ?? id} · {isDemoMode ? 'Demo' : 'Live'}</p>
        </div>
        <button
          onClick={() => id && loadDeviceState(id)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-ink-10 active:scale-95 transition-transform"
        >
          <RefreshCw size={15} className="text-primary" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">

        {/* 设备元数据 */}
        <div className="px-4 pt-4">
          <p className="text-caption font-semibold text-ink-7 uppercase tracking-wide mb-2">Device Info</p>
          <div className="rounded-l bg-ink-10 overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
            {[
              { label: 'Device ID', value: String(device?.id ?? id ?? '--') },
              { label: 'Name (name)', value: device?.name ?? '--' },
              { label: 'Model (model)', value: device?.model ?? device?.gatherProtocolNameDisplay ?? '--' },
              { label: 'Serial Number (serialNumber)', value: device?.serialNumber ?? '--' },
              { label: 'Rated Power (ratedPower)', value: device?.ratedPower != null ? `${device.ratedPower * 1000} W (${device.ratedPower} kW)` : '--' },
              { label: 'Online Status (isOnline)', value: device?.isOnline ? 'Online' : 'Offline' },
              { label: 'Last Updated', value: updatedAt },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3 gap-3">
                <span className="text-caption text-ink-7 flex-1 min-w-0">{row.label}</span>
                <span className="text-body-md font-medium text-white text-right">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 参数分组 */}
        {PARAM_GROUPS.map(group => (
          <div key={group.title} className="px-4 pt-4">
            <p className="text-caption font-semibold uppercase tracking-wide mb-2" style={{ color: group.color }}>
              {group.title}
            </p>
            <div className="rounded-l bg-ink-10 overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
              {group.params.map(p => {
                const val = getValue(p)
                const missing = val === '--'
                return (
                  <div key={p.key} className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-caption text-ink-8 flex-1 min-w-0 leading-snug">{p.label}</span>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-body-md font-semibold ${missing ? 'text-ink-9' : 'text-white'}`}>
                        {val}
                      </span>
                      {p.unit && !missing && (
                        <span className="text-caption text-ink-7 ml-1">{p.unit}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* UI 派生 / 计算参数 */}
        <div className="px-4 pt-4">
          <p className="text-caption font-semibold uppercase tracking-wide mb-2" style={{ color: '#01D6BE' }}>
            UI Derived / Computed Params
          </p>
          <div className="rounded-l bg-ink-10 overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
            {derivedRows.map(row => {
              const missing = row.value === '--'
              return (
                <div key={row.label} className="flex items-center justify-between px-4 py-3 gap-3">
                  <span className="text-caption text-ink-8 flex-1 min-w-0 leading-snug">{row.label}</span>
                  <span className={`text-body-md font-semibold flex-shrink-0 text-right ${missing ? 'text-ink-9' : 'text-white'}`}>
                    {row.value}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 6月25日历史数据 — SN 2412315001 */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <History size={12} className="text-primary" />
            <p className="text-caption font-semibold uppercase tracking-wide text-primary">
              History · Jun 25 · SN {TARGET_SN}
            </p>
          </div>

          {historyLoading && (
            <div className="flex items-center justify-center py-6 rounded-l bg-ink-10">
              <Loader2 size={18} className="text-primary animate-spin mr-2" />
              <span className="text-caption text-ink-7">
                Page {historyPage} · {historyPoints.length} fetched…
              </span>
            </div>
          )}

          {historyError && !historyLoading && (
            <div className="rounded-l bg-ink-10 px-4 py-3">
              <span className="text-caption text-[#FF3530]">{historyError}</span>
            </div>
          )}

          {history && (
            <>
              {/* 统计摘要 */}
              <div className="rounded-l bg-ink-10 overflow-hidden divide-y divide-[rgba(255,255,255,0.04)] mb-3">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-caption text-ink-7">Samples</span>
                  <span className="text-body-md font-semibold text-white">
                    {historyPoints.length}
                    {historyLoading && <span className="text-caption text-ink-8 ml-1">(loading…)</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-caption text-ink-7">Data Source</span>
                  <span className="text-caption text-primary">
                    {historyFromCache ? 'Local Cache' : `API Paged · ${historyDone ? historyPage : historyPage + '…'} pages`}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-caption text-ink-7">Rows Saved</span>
                  <span className="text-caption text-success">{savedCount} rows</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-caption text-ink-7">Time Range</span>
                  <span className="text-caption text-ink-5">
                    {historyPoints[0]?.time.slice(11, 16)} – {historyPoints[historyPoints.length - 1]?.time.slice(11, 16)}
                  </span>
                </div>

                {/* Solar */}
                {[
                  { label: 'Solar (generationPower)', s: history.solar, unit: 'W', color: '#FF9500' },
                  { label: 'Output (outputPower)',    s: history.output, unit: 'W', color: '#BFBFBF' },
                ].map(({ label, s, unit, color }) => (
                  <div key={label}>
                    <div className="px-4 pt-2.5 pb-0.5">
                      <span className="text-caption font-semibold" style={{ color }}>{label}</span>
                    </div>
                    <div className="grid grid-cols-4 px-4 pb-2.5 gap-1">
                      {[
                        { k: 'Min', v: s.min },
                        { k: 'Max', v: s.max },
                        { k: 'Avg', v: s.avg },
                        { k: 'Sum', v: s.total },
                      ].map(({ k, v }) => (
                        <div key={k} className="flex flex-col items-center bg-[#1A1A1A] rounded-m py-1.5">
                          <span className="text-tiny text-ink-8">{k}</span>
                          <span className="text-caption font-semibold text-white">{Math.round(v)}</span>
                          <span className="text-tiny text-ink-8">{unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* SOC */}
                <div>
                  <div className="px-4 pt-2.5 pb-0.5">
                    <span className="text-caption font-semibold text-success">SOC (remainingBatteryCapacity)</span>
                  </div>
                  <div className="grid grid-cols-3 px-4 pb-2.5 gap-1">
                    {[
                      { k: 'Min', v: history.soc.min },
                      { k: 'Max', v: history.soc.max },
                      { k: 'Avg', v: history.soc.avg },
                    ].map(({ k, v }) => (
                      <div key={k} className="flex flex-col items-center bg-[#1A1A1A] rounded-m py-1.5">
                        <span className="text-tiny text-ink-8">{k}</span>
                        <span className="text-caption font-semibold text-white">{Math.round(v)}</span>
                        <span className="text-tiny text-ink-8">%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 原始采样明细（可展开） */}
              <button
                onClick={() => setShowRawHistory(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-l bg-ink-11 mb-3 active:opacity-70 transition-opacity"
              >
                <span className="text-caption text-ink-7">Raw Samples ({historyPoints.length} rows)</span>
                <span className="text-caption text-primary">{showRawHistory ? 'Collapse' : 'Expand'}</span>
              </button>

              {showRawHistory && (
                <div className="rounded-l bg-[#1A1A1A] overflow-hidden mb-3">
                  {/* 表头 */}
                  <div className="grid grid-cols-4 px-3 py-2 border-b border-[rgba(255,255,255,0.06)]">
                    {['Time', 'Solar W', 'Output W', 'SOC %'].map(h => (
                      <span key={h} className="text-tiny text-ink-8 text-center">{h}</span>
                    ))}
                  </div>
                  {historyPoints.map((p, i) => (
                    <div key={i} className="grid grid-cols-4 px-3 py-1.5 border-b border-[rgba(255,255,255,0.03)]">
                      <span className="text-tiny font-mono text-ink-8">{p.time.slice(11, 16)}</span>
                      <span className="text-tiny text-warning text-center">{Math.round(p.solar)}</span>
                      <span className="text-tiny text-ink-6 text-center">{Math.round(p.output)}</span>
                      <span className="text-tiny text-success text-center">{Math.round(p.soc)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 原始 API 字段（全部） */}
        <div className="px-4 pt-4">
          <p className="text-caption font-semibold text-ink-7 uppercase tracking-wide mb-2">
            Raw API Fields (/remote/device/state/latest)
          </p>
          <div className="rounded-l bg-[#1A1A1A] overflow-hidden divide-y divide-[rgba(255,255,255,0.03)]">
            {Object.keys(rawFields).length === 0 ? (
              <p className="text-caption text-ink-9 text-center py-4">No data</p>
            ) : (
              Object.entries(rawFields).map(([key, field]) => (
                <div key={key} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <span className="text-tiny text-ink-8 font-mono flex-1 min-w-0 truncate">{key}</span>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-caption font-medium text-ink-5">
                      {field.valueDisplay ?? String(field.value ?? '--')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
