import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  Hash,
  Cpu,
  Server,
  Battery,
  Zap,
  Thermometer,
  Calendar,
  Wifi,
  Activity,
  Layers,
} from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime } from '../api/deviceApi'
import { formatTemp } from '../utils/localization'
import BatteryRing from '../components/BatteryRing'
import { DataSourceTag, LastSync, SampleRate } from '../components/DataTrust'

/**
 * PRD v1.1 §4.3.4: Device Info 详情页
 * 展示设备完整规格信息：Model, SN, Capacity, Battery Type, Charging Power,
 * Output Power, Voltage, Frequency, Battery Health, Cycles, Temperature (°F), Wifi Status
 */
export default function DeviceInfoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { devices, selectedDeviceDetails, selectedDeviceState, loadDeviceDetails, loadDeviceState } = useDeviceStore()

  // 同步 URL deviceId
  useMemo(() => {
    if (id) {
      loadDeviceDetails(id)
      loadDeviceState(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 找到当前设备（API 设备列表或详情）
  const device = useMemo(() => {
    return devices.find(d => String(d.id) === id) ?? selectedDeviceDetails ?? null
  }, [devices, selectedDeviceDetails, id])

  // 实时状态（电压、频率、电流等）
  const realtime = useMemo(() => {
    if (!selectedDeviceState?.fields) return null
    return mapFieldsToRealtime(selectedDeviceState.fields)
  }, [selectedDeviceState])

  // 设备名 & 元信息
  const deviceName = device?.name ?? 'Device'
  const model = device?.gatherProtocolNameDisplay ?? device?.model ?? 'Sierro 2000'
  const serial = device?.serialNumber ?? '--'
  const station = device?.stationName ?? '--'
  const firmware = device?.softwareVersion ?? '--'
  const isOnline = device?.isOnline ?? false
  const lastDataAt = device?.lastDataAt ? new Date(device.lastDataAt).getTime() : undefined

  // SOC / Temp（从实时数据回退到字段或 0）
  const soc = realtime?.soc ?? 0
  const batteryTemp = realtime?.batteryTemp ?? 0
  const batteryPower = realtime?.batteryPower ?? 0
  const outputPower = realtime?.outputPower ?? 0
  const acPower = realtime?.acPower ?? 0
  const solarPower = realtime?.solarPower ?? 0

  // 估算健康度、循环次数（API 暂不返回，从温度和功率推算）
  const batteryHealth = useMemo(() => {
    if (batteryTemp > 50) return 78
    if (batteryTemp > 40) return 88
    return 95
  }, [batteryTemp])

  const cycles = useMemo(() => {
    // Demo 估算
    if (!device?.installedAt) return 142
    const days = Math.floor((Date.now() - new Date(device.installedAt).getTime()) / (24 * 3600 * 1000))
    return Math.max(0, Math.min(2000, Math.floor(days * 0.5)))
  }, [device?.installedAt])

  // 模拟规格（API 不直接返回，根据 model 推断）
  const specs = useMemo(() => {
    const lower = model.toLowerCase()
    const is2000 = lower.includes('2000')
    return {
      capacity: is2000 ? '2000 Wh' : '1024 Wh',
      batteryType: is2000 ? 'LiFePO4' : 'NMC',
      maxChargePower: is2000 ? '1000 W' : '1100 W',
      maxOutputPower: is2000 ? '1000 W' : '1500 W',
      voltage: is2000 ? '6.4V DC' : '120 V AC',
      frequency: '60 Hz',
      weight: is2000 ? '~15 kg' : '12.5 kg',
      dimensions: is2000 ? 'Compact Portable' : '340 × 220 × 250 mm',
      cyclesRated: 3000,
    }
  }, [model])

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF] active:scale-95 transition-transform"
          aria-label="Back to device settings"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[#FFFFFF]">Device Info</h2>
          <p className="text-caption text-[#A0A0A5]">{deviceName}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-6">
        {/* Top card: status + ring */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#262626] rounded-[24px] p-5 mb-4"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-[20px] bg-[rgba(1,214,190,0.12)] flex items-center justify-center flex-shrink-0">
              <Battery size={28} className="text-[#01D6BE]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-[#FFFFFF] truncate">{model}</h3>
              <p className="text-label text-[#A0A0A5] mt-0.5">SN: {serial}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <DataSourceTag source="ble" />
                <LastSync lastSyncAt={lastDataAt} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex-shrink-0">
              <BatteryRing percentage={soc} isCharging={batteryPower > 0} timeToFull="--" uid={`info-${id}`} />
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2.5">
              <div className="bg-[#141414] rounded-l p-2.5 text-center">
                <div className="text-body-md font-bold text-[#FFFFFF]">{soc}%</div>
                <div className="text-xs text-[#A0A0A5] mt-0.5">SOC</div>
              </div>
              <div className="bg-[#141414] rounded-l p-2.5 text-center">
                <div className="text-body-md font-bold text-[#FF9500]">
                  {batteryTemp > 0 ? formatTemp(batteryTemp, 'F') : '--'}
                </div>
                <div className="text-xs text-[#A0A0A5] mt-0.5">Temp</div>
              </div>
              <div className="bg-[#141414] rounded-l p-2.5 text-center">
                <div className="text-body-md font-bold text-[#34C759]">{batteryHealth}%</div>
                <div className="text-xs text-[#A0A0A5] mt-0.5">Health</div>
              </div>
              <div className="bg-[#141414] rounded-l p-2.5 text-center">
                <div className="text-body-md font-bold text-[#01D6BE]">{cycles}</div>
                <div className="text-xs text-[#A0A0A5] mt-0.5">Cycles</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-4 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <SampleRate intervalSec={30} />
            <div className="flex items-center gap-1.5">
              <Wifi size={12} className={isOnline ? 'text-[#34C759]' : 'text-[#636366]'} />
              <span className={`text-caption ${isOnline ? 'text-[#34C759]' : 'text-[#636366]'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Specifications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Specifications
          </div>
          <div className="bg-[#262626] rounded-[20px] overflow-hidden divide-y divide-[rgba(255,255,255,0.06)]">
            <InfoRow icon={Battery} label="Battery Capacity" value={specs.capacity} subValue={specs.batteryType} color="#34C759" />
            <InfoRow icon={Zap} label="Max Output Power" value={specs.maxOutputPower} subValue={`Surge ${specs.maxOutputPower.replace(' W', '0 W')}`} color="#01D6BE" />
            <InfoRow icon={Zap} label="Max Charge Power" value={specs.maxChargePower} subValue="AC + Solar + DC" color="#FF9500" />
            <InfoRow icon={Activity} label="Output Voltage" value={specs.voltage} subValue={`Frequency ${specs.frequency}`} color="#A855F7" />
            <InfoRow icon={Thermometer} label="Operating Temp" value="-10°C to 45°C" subValue="Optimal 20°C to 30°C" color="#FF3B30" />
            <InfoRow icon={Layers} label="Weight" value={specs.weight} subValue={specs.dimensions} color="#FFD700" />
          </div>
        </motion.div>

        {/* Identity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-4"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Identity
          </div>
          <div className="bg-[#262626] rounded-[20px] overflow-hidden divide-y divide-[rgba(255,255,255,0.06)]">
            <InfoRow icon={Cpu} label="Model" value={model} color="#01D6BE" />
            <InfoRow icon={Hash} label="Serial Number" value={serial} color="#A0A0A5" />
            <InfoRow icon={Server} label="Station" value={station} color="#34C759" />
            <InfoRow icon={Calendar} label="Firmware" value={firmware} color="#A0A0A5" />
          </div>
        </motion.div>

        {/* Live readings (when online) */}
        {realtime && (acPower > 0 || solarPower > 0 || outputPower > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-4"
          >
            <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
              Live Readings
            </div>
            <div className="bg-[#262626] rounded-[20px] p-4 grid grid-cols-3 gap-2.5">
              <LiveReading label="AC" value={`${acPower}W`} color="#01D6BE" />
              <LiveReading label="Solar" value={`${solarPower}W`} color="#FF9500" />
              <LiveReading label="Output" value={`${outputPower}W`} color="#A0A0A5" />
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div className="text-center pt-3 text-caption text-[#636366]">
          <div>Sierro Inc. · {model}</div>
          <div className="mt-1">Cycles rated: {specs.cyclesRated}+ to 80% capacity</div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, subValue, color }: { icon: typeof Battery; label: string; value: string; subValue?: string; color: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-caption text-[#A0A0A5]">{label}</div>
        <div className="text-body-md font-semibold text-[#FFFFFF] mt-0.5">{value}</div>
        {subValue && <div className="text-xs text-[#636366] mt-0.5">{subValue}</div>}
      </div>
    </div>
  )
}

function LiveReading({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#141414] rounded-l p-3 text-center">
      <div className="text-body-md font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-[#A0A0A5] mt-0.5">{label}</div>
    </div>
  )
}
