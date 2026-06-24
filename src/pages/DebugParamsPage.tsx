/**
 * 调试参数页
 * 路由：/device/:id/debug-params
 * 显示本 App 所有 UI 使用的实时参数数值及原始 API 字段
 */
import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime } from '../api/deviceApi'

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
    title: '电量 / 容量',
    color: '#01D6BE',
    params: [
      { label: 'SOC (remainingBatteryCapacity)', key: 'remainingBatteryCapacity', unit: '%' },
      { label: '电池容量 (batteryCapacity)', key: 'batteryCapacity', unit: 'Wh' },
      { label: '电池电流 (batteryCurrent)', key: 'batteryCurrent', unit: 'A', fmt: fmt1 },
      { label: '充放循环次数 (numberOfBatteryUsageCycles)', key: 'numberOfBatteryUsageCycles', unit: '次' },
    ],
  },
  {
    title: '功率',
    color: '#FFD700',
    params: [
      { label: 'AC充电功率 (exchangeChargingPower)', key: 'acPower', unit: 'W' },
      { label: 'PV发电功率 (generationPower)', key: 'solarPower', unit: 'W' },
      { label: '负载输出功率 (outputPower)', key: 'outputPower', unit: 'W' },
      { label: '电池功率 (batteryPower)', key: 'batteryPower', unit: 'W' },
    ],
  },
  {
    title: '电压 / 频率',
    color: '#FF9500',
    params: [
      { label: 'AC输入电压 (l1AcInputVoltage)', key: 'acInputVoltage', unit: 'V', fmt: fmt1 },
      { label: 'AC输入频率 (acInputFrequency)', key: 'acInputFrequency', unit: 'Hz', fmt: fmt1 },
      { label: 'AC输出电压 (acOutputVoltage)', key: 'acOutputVoltage', unit: 'V', fmt: fmt1 },
      { label: 'AC输出频率 (acOutputFrequency)', key: 'acOutputFrequency', unit: 'Hz', fmt: fmt1 },
      { label: 'PV输入电压 (solarInputVoltage)', key: 'solarInputVoltage', unit: 'V', fmt: fmt1 },
    ],
  },
  {
    title: '温度',
    color: '#FF3530',
    params: [
      { label: '电芯1温度 (cellTemperature1)', key: 'batteryTemp', unit: '℃', fmt: fmt1 },
      { label: '电芯2温度 (cellTemperature2)', key: 'cellTemperature2', unit: '℃', fmt: fmt1 },
      { label: '电芯3温度 (cellTemperature3)', key: 'cellTemperature3', unit: '℃', fmt: fmt1 },
      { label: 'MPPT温度 (mpptTemperature)', key: 'mpptTemperature', unit: '℃', fmt: fmt1 },
      { label: 'DCDC温度 (dcdcTemperature)', key: 'dcdcTemperature', unit: '℃', fmt: fmt1 },
    ],
  },
  {
    title: '能量统计',
    color: '#34C759',
    params: [
      { label: '当日PV发电量 (pvGeneratedEnergyOfDay)', key: 'pvGeneratedEnergyOfDay', unit: 'Wh' },
      { label: '累计PV发电量 (totalPVGeneratedEnergy)', key: 'totalPVGeneratedEnergy', unit: 'Wh' },
      { label: '充电累计时间 (accumulatedChargingTime)', key: 'accumulatedChargingTime', unit: 'h' },
      { label: '放电累计时间 (accumulatedDischargeTime)', key: 'accumulatedDischargeTime', unit: 'h' },
    ],
  },
  {
    title: '开关状态',
    color: '#8C8C8C',
    params: [
      { label: 'AC输出1 (inversionState)', key: 'acOut1Enable', fmt: fmtBool },
      { label: 'AC输出2 (acOut2Enable)', key: 'acOut2Enable', fmt: fmtBool },
      { label: 'USB输出 (usbOut1Enable)', key: 'usbOut1Enable', fmt: fmtBool },
      { label: 'PV充电 (photovoltaicCharging)', key: 'photovoltaicCharging', fmt: fmtBool },
      { label: 'AC充电 (mainsCharging)', key: 'mainsCharging', fmt: fmtBool },
      { label: 'AC输出总 (acOutputs)', key: 'acOutputs', fmt: fmtBool },
      { label: '旁路 (bypassStatus)', key: 'bypassStatus', fmt: fmtBool },
      { label: '无负载关机 (noLoadShutdown)', key: 'noLoadShutdown', fmt: fmtBool },
      { label: 'Sleep Mode (sleepMode)', key: 'sleepMode', fmt: fmtBool },
    ],
  },
  {
    title: '模式 / 版本',
    color: '#BFBFBF',
    params: [
      { label: '工作模式 (workMode)', key: 'workMode', fmt: fmtMode },
      { label: '硬件版本 (hardwareVersion)', key: 'hardwareVersion' },
      { label: '主控软件版本 (softwareVersionNumber)', key: 'softwareVersionNumber' },
      { label: '逆变软件版本 (inverterSoftwareVersionNumber)', key: 'inverterSoftwareVersionNumber' },
    ],
  },
]

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function DebugParamsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { devices, selectedDeviceState, loadDeviceState, isDemoMode } = useDeviceStore()
  const device = devices.find(d => String(d.id) === id)

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

  return (
    <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3 border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#262626]"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-title-lg font-semibold text-white">调试参数</h1>
          <p className="text-tiny text-[#595959]">{device?.name ?? id} · {isDemoMode ? 'Demo' : '实时'}</p>
        </div>
        <button
          onClick={() => id && loadDeviceState(id)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#262626] active:scale-95 transition-transform"
        >
          <RefreshCw size={15} className="text-[#01D6BE]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">

        {/* 设备元数据 */}
        <div className="px-4 pt-4">
          <p className="text-caption font-semibold text-[#8C8C8C] uppercase tracking-wide mb-2">设备信息</p>
          <div className="rounded-l bg-[#262626] overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
            {[
              { label: 'Device ID', value: String(device?.id ?? id ?? '--') },
              { label: '设备名称 (name)', value: device?.name ?? '--' },
              { label: '型号 (model)', value: device?.model ?? device?.gatherProtocolNameDisplay ?? '--' },
              { label: '序列号 (serialNumber)', value: device?.serialNumber ?? '--' },
              { label: '额定功率 (ratedPower)', value: device?.ratedPower != null ? `${device.ratedPower * 1000} W (${device.ratedPower} kW)` : '--' },
              { label: '在线状态 (isOnline)', value: device?.isOnline ? 'Online' : 'Offline' },
              { label: '最后更新', value: updatedAt },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3 gap-3">
                <span className="text-caption text-[#8C8C8C] flex-1 min-w-0">{row.label}</span>
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
            <div className="rounded-l bg-[#262626] overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
              {group.params.map(p => {
                const val = getValue(p)
                const missing = val === '--'
                return (
                  <div key={p.key} className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-caption text-[#595959] flex-1 min-w-0 leading-snug">{p.label}</span>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-body-md font-semibold ${missing ? 'text-[#454545]' : 'text-white'}`}>
                        {val}
                      </span>
                      {p.unit && !missing && (
                        <span className="text-caption text-[#8C8C8C] ml-1">{p.unit}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* 原始 API 字段（全部） */}
        <div className="px-4 pt-4">
          <p className="text-caption font-semibold text-[#8C8C8C] uppercase tracking-wide mb-2">
            原始 API 字段（/remote/device/state/latest）
          </p>
          <div className="rounded-l bg-[#1A1A1A] overflow-hidden divide-y divide-[rgba(255,255,255,0.03)]">
            {Object.keys(rawFields).length === 0 ? (
              <p className="text-caption text-[#454545] text-center py-4">暂无数据</p>
            ) : (
              Object.entries(rawFields).map(([key, field]) => (
                <div key={key} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <span className="text-tiny text-[#595959] font-mono flex-1 min-w-0 truncate">{key}</span>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-caption font-medium text-[#D9D9D9]">
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
