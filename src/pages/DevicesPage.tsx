import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Menu, User, Search, Zap, Battery, AlertTriangle, X, Plus, QrCode } from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'

const filters = ['All', 'Online', 'Offline', 'Alerts']

export default function DevicesPage() {
  const navigate = useNavigate()
  const { devices, toggleDevice } = usePowerStationStore()
  const [activeFilter, setActiveFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)

  // 低电量 (<30%) 或离线状态视为 Alert
  const hasAlert = (device: typeof devices[0]) =>
    device.batteryLevel < 30 || device.status === 'offline'

  const filteredDevices = devices.filter(device => {
    if (activeFilter === 'Online') return device.status === 'online'
    if (activeFilter === 'Offline') return device.status === 'offline'
    if (activeFilter === 'Alerts') return hasAlert(device)
    return true
  }).filter(device =>
    device.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeCount = devices.filter(d => d.isOn).length
  const alertCount = devices.filter(hasAlert).length

  const getBatteryColor = (level: number) => {
    if (level >= 70) return 'text-[#34C759]'
    if (level >= 30) return 'text-[#FF9500]'
    return 'text-[#FF3B30]'
  }

  const getIconColor = (type: string) => {
    switch (type) {
      case 'cpap': return 'bg-[rgba(26,217,192,0.15)] text-[#1AD9C0]'
      case 'fridge': return 'bg-[rgba(255,149,0,0.15)] text-[#FF9500]'
      case 'powerstation': return 'bg-[rgba(52,199,89,0.15)] text-[#34C759]'
      default: return 'bg-[rgba(26,217,192,0.15)] text-[#1AD9C0]'
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex justify-between items-center">
        <button className="w-9 h-9 rounded-[14px] bg-[#1C1C1E] border border-[rgba(26,217,192,0.08)] 
                         flex items-center justify-center text-[#FFFFFF]">
          <Menu size={20} />
        </button>
        <h2 className="text-xl font-bold text-[#FFFFFF]">Devices</h2>
        <button
          onClick={() => navigate('/settings')}
          className="w-9 h-9 rounded-[14px] bg-[#1C1C1E] border border-[rgba(26,217,192,0.08)] 
                   flex items-center justify-center text-[#FFFFFF]
                   hover:border-[rgba(26,217,192,0.4)] hover:bg-[rgba(26,217,192,0.06)] transition-all duration-250"
        >
          <User size={20} />
        </button>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {/* 搜索栏 */}
        <div className="relative mb-4">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8E93]">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search devices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 bg-[#1C1C1E] border border-[rgba(26,217,192,0.08)] rounded-[28px]
                     pl-11 pr-10 text-sm text-[#FFFFFF] placeholder-[#8E8E93]
                     focus:border-[rgba(26,217,192,0.4)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(26,217,192,0.1)]
                     transition-all duration-250"
          />
          <AnimatePresence>
            {searchQuery && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15 }}
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full
                           bg-[rgba(255,255,255,0.1)] text-[#8E8E93] hover:text-[#FFFFFF]
                           flex items-center justify-center transition-colors"
              >
                <X size={13} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* 筛选标签 */}
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide mb-4 pb-1">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`
                flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium
                whitespace-nowrap transition-all duration-250
                ${activeFilter === filter
                  ? filter === 'Alerts'
                    ? 'bg-[#FF3B30] text-white'
                    : 'bg-[#1AD9C0] text-[#000000]'
                  : 'bg-[#1C1C1E] border border-[rgba(26,217,192,0.08)] text-[#8E8E93]'
                }
              `}
            >
              {filter}
              {filter === 'Alerts' && alertCount > 0 && (
                <span className={`
                  w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center
                  ${activeFilter === 'Alerts' ? 'bg-white text-[#FF3B30]' : 'bg-[#FF3B30] text-white'}
                `}>
                  {alertCount}
                </span>
              )}
              {activeFilter === filter && filter !== 'Alerts' && (
                <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] 
                               border-l-transparent border-r-transparent border-t-current" />
              )}
            </button>
          ))}
        </div>

        {/* 添加设备按钮区 */}
        <div className="flex gap-3 mb-5">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAddModal(true)}
            className="flex-1 h-12 bg-[#1C1C1E] border border-[rgba(26,217,192,0.25)] rounded-[20px]
                     text-[#1AD9C0] font-semibold text-[14px]
                     flex items-center justify-center gap-2
                     hover:bg-[rgba(26,217,192,0.08)] hover:border-[rgba(26,217,192,0.5)]
                     hover:shadow-[0_0_16px_rgba(26,217,192,0.15)] transition-all duration-250"
          >
            <Plus size={18} />
            Add Device
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowQrModal(true)}
            className="flex-1 h-12 bg-[#1C1C1E] border border-[rgba(52,199,89,0.25)] rounded-[20px]
                     text-[#34C759] font-semibold text-[14px]
                     flex items-center justify-center gap-2
                     hover:bg-[rgba(52,199,89,0.08)] hover:border-[rgba(52,199,89,0.5)]
                     hover:shadow-[0_0_16px_rgba(52,199,89,0.15)] transition-all duration-250"
          >
            <QrCode size={18} />
            Scan QR
          </motion.button>
        </div>

        {/* 设备列表标题 */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-[#FFFFFF]">Connected Devices</h3>
          <span className="text-[11px] px-2.5 py-1 rounded-full 
                         bg-[rgba(26,217,192,0.12)] text-[#1AD9C0] border border-[rgba(26,217,192,0.25)]
                         font-semibold">
            {activeCount} Active
          </span>
        </div>

        {/* 设备列表 */}
        <div className="flex flex-col gap-3">
          {filteredDevices.map((device) => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-3.5 p-4 bg-[#1C1C1E] border rounded-[20px]
                       hover:bg-[#2C2C2E] transition-all duration-250
                       ${hasAlert(device)
                         ? 'border-[rgba(255,59,48,0.3)] bg-[rgba(255,59,48,0.03)]'
                         : 'border-[rgba(26,217,192,0.08)] hover:border-[rgba(26,217,192,0.18)]'
                       }`}
            >
              <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0
                             ${getIconColor(device.type)}`}>
                {device.type === 'powerstation' ? <Battery size={24} /> : <Zap size={24} />}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[15px] font-semibold text-[#FFFFFF]">{device.name}</div>
                  {hasAlert(device) && (
                    <AlertTriangle size={13} className="text-[#FF3B30] flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs ${device.status === 'online' ? 'text-[#8E8E93]' : 'text-[#FF3B30]'}`}>
                    {device.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${getBatteryColor(device.batteryLevel)}`}>
                    <Battery size={12} />
                    {device.batteryLevel}%
                  </span>
                </div>
              </div>

              <ToggleSwitch
                isOn={device.isOn}
                onToggle={() => toggleDevice(device.id)}
              />
            </motion.div>
          ))}
        </div>

        {filteredDevices.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-[#48484A]"
          >
            <Battery size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-[#8E8E93]">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : activeFilter === 'Alerts'
                ? 'No alerts — all devices are healthy'
                : `No ${activeFilter.toLowerCase()} devices`}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-3 text-[12px] text-[#1AD9C0] underline"
              >
                Clear search
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.7)] backdrop-blur-sm z-50 flex items-end"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#1C1C1E] border-t border-[rgba(26,217,192,0.15)] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-[#FFFFFF] mb-5">Add New Device</h3>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Bluetooth Scan', desc: 'Find nearby BLE devices', color: '#1AD9C0', icon: '📡' },
                  { label: 'Wi-Fi Setup', desc: 'Connect via local network', color: '#34C759', icon: '📶' },
                  { label: 'Manual Entry', desc: 'Enter device code manually', color: '#FF9500', icon: '⌨️' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setShowAddModal(false)}
                    className="flex items-center gap-4 p-4 bg-[#0D1826] border border-[rgba(255,255,255,0.06)]
                               rounded-[16px] text-left hover:border-[rgba(26,217,192,0.25)] transition-all"
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <div>
                      <div className="text-[14px] font-semibold" style={{ color: opt.color }}>{opt.label}</div>
                      <div className="text-[11px] text-[#8E8E93] mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-full mt-4 h-11 rounded-[14px] bg-[rgba(255,255,255,0.06)] text-[#8E8E93] text-sm font-medium"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scan QR Modal */}
      <AnimatePresence>
        {showQrModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.85)] backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setShowQrModal(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="mx-6 bg-[#1C1C1E] border border-[rgba(26,217,192,0.2)] rounded-[28px] p-6 text-center"
            >
              {/* 模拟摄像头取景框 */}
              <div className="w-52 h-52 mx-auto mb-4 relative">
                <div className="absolute inset-0 bg-[#0D1826] rounded-[16px] border border-[rgba(26,217,192,0.15)] 
                               flex items-center justify-center">
                  <QrCode size={64} className="text-[rgba(26,217,192,0.3)]" />
                </div>
                {/* 扫描线动画 */}
                <motion.div
                  className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#1AD9C0] to-transparent
                             shadow-[0_0_8px_rgba(26,217,192,0.6)]"
                  animate={{ top: ['10%', '85%', '10%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                />
                {/* 四角标记 */}
                {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],
                  ['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']
                ].map(([pos, border], i) => (
                  <div key={i} className={`absolute w-5 h-5 ${pos} ${border} border-[#1AD9C0] rounded-sm`} />
                ))}
              </div>
              <div className="text-[15px] font-semibold text-[#FFFFFF] mb-1">Scan Device QR Code</div>
              <div className="text-[12px] text-[#8E8E93] mb-5">Point camera at the QR code on your device</div>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-full h-11 rounded-[14px] bg-[rgba(255,255,255,0.06)] text-[#8E8E93] text-sm font-medium"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
