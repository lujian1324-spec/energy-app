/**
 * 手动添加设备 Modal
 * 用户输入 SN 码 + 设备名称，调用 /device/add/single API 绑定设备到账户
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Loader2, AlertCircle, Keyboard } from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import { useToast } from '../components/Toast'

interface Props {
  onClose: () => void
}

export default function ManualAddDeviceModal({ onClose }: Props) {
  const { addNewDevice, addNewDeviceWithStation, loadDevices, stations } = useDeviceStore()
  const { show: showToast } = useToast()

  const [deviceName, setDeviceName] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [dtuDtuid, setDtuDtuid] = useState('')
  const [stationId, setStationId] = useState<number | ''>('')
  const [createNewStation, setCreateNewStation] = useState(false)
  const [newStationName, setNewStationName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!deviceName.trim()) { setError('Please enter a device name'); return }
    if (!serialNumber.trim() && !dtuDtuid.trim()) {
      setError('Please enter a serial number or DTU ID')
      return
    }

    setLoading(true)
    try {
      if (createNewStation || stations.length === 0) {
        // 没有电站时，自动创建电站并添加设备
        const result = await addNewDeviceWithStation({
          deviceName: deviceName.trim(),
          stationId: 0,
          dtuDtuid: dtuDtuid.trim() || serialNumber.trim(),
          deviceSerialNumber: serialNumber.trim(),
          stationName: newStationName.trim() || `${deviceName.trim()}'s Station`,
          country: 'US',
          latitude: 0,
          longitude: 0,
          stationType: 0,
          connectedGridType: 0,
          installedCapacity: 1,
          timezone: 'America/Los_Angeles',
          currencyCode: 'USD',
        })

        if (result.code === 0 || result.code === '0') {
          showToast({ type: 'success', title: 'Device added successfully!' })
          loadDevices()
          onClose()
        } else {
          setError(result.message ?? 'Failed to add device')
        }
      } else {
        // 有电站，添加到选中电站
        const sid = stationId || stations[0]?.id || 0
        const result = await addNewDevice({
          deviceName: deviceName.trim(),
          stationId: sid,
          dtuDtuid: dtuDtuid.trim() || serialNumber.trim(),
          deviceSerialNumber: serialNumber.trim(),
        })

        if (result.code === 0 || result.code === '0') {
          showToast({ type: 'success', title: 'Device added successfully!' })
          loadDevices()
          onClose()
        } else {
          setError(result.message ?? 'Failed to add device')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-[rgba(0,0,0,0.7)] z-50 flex items-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 300, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[#262626] rounded-t-[28px] p-6 pb-10 max-h-[85vh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
            <Keyboard size={18} className="text-[#FF9500]" />
            Add Device Manually
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#333333] flex items-center justify-center text-[#A0A0A5]"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 设备名称 */}
          <div>
            <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 block">
              Device Name *
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={e => { setDeviceName(e.target.value); setError(null) }}
              placeholder="e.g. Sierro 1000"
              className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)]
                text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
            />
          </div>

          {/* 序列号 */}
          <div>
            <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 block">
              Serial Number (SN)
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={e => { setSerialNumber(e.target.value); setError(null) }}
              placeholder="e.g. 999256001232612"
              className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)]
                text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
            />
          </div>

          {/* DTU ID */}
          <div>
            <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 block">
              DTU ID (Data Logger)
            </label>
            <input
              type="text"
              value={dtuDtuid}
              onChange={e => { setDtuDtuid(e.target.value); setError(null) }}
              placeholder="e.g. DTU serial number"
              className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)]
                text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
            />
          </div>

          {/* 选择电站（如果有） */}
          {stations.length > 0 && (
            <div>
              <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 block">
                Station
              </label>
              <select
                value={stationId}
                onChange={e => setStationId(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)]
                  text-[#FFFFFF] text-body-md focus:outline-none focus:border-[rgba(1,214,190,0.5)]"
              >
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreateNewStation(v => !v)}
                className="mt-2 text-label text-[#01D6BE] font-medium"
              >
                {createNewStation ? '← Select existing station' : '+ Create new station'}
              </button>
            </div>
          )}

          {/* 新电站名称 */}
          {createNewStation && (
            <div>
              <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 block">
                New Station Name
              </label>
              <input
                type="text"
                value={newStationName}
                onChange={e => setNewStationName(e.target.value)}
                placeholder="e.g. Home Solar Station"
                className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)]
                  text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                  focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
              />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-l
              bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.2)]">
              <AlertCircle size={14} className="text-[#FF3B30] flex-shrink-0" />
              <p className="text-label text-[#FF3B30]">{error}</p>
            </div>
          )}

          {/* 提交 */}
          <button
            type="submit"
            disabled={loading || !deviceName.trim()}
            className="w-full py-3.5 rounded-l font-semibold text-body-md
              bg-[#01D6BE] text-[#000000]
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Adding device...</span>
              </>
            ) : (
              'Add Device'
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
