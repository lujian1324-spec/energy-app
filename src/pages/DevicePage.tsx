import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Menu, User, Search, Zap, Battery, AlertTriangle, X, Plus, QrCode, Trash2, Power } from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'

const filters = ['All', 'Online', 'Offline', 'Alerts']

export default function DevicePage() {
  const navigate = useNavigate()
  const { devices, toggleDevice, selectDevice, toggleDevices, deleteDevices } = usePowerStationStore()
  const [activeFilter, setActiveFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showQrScan, setShowQrScan] = useState(false)
  
  // Batch Control 模式
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())

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
      case 'cpap': return 'bg-[rgba(1,214,190,0.15)] text-[#01D6BE]'
      case 'fridge': return 'bg-[rgba(255,149,0,0.15)] text-[#FF9500]'
      case 'powerstation': return 'bg-[rgba(52,199,89,0.15)] text-[#34C759]'
      default: return 'bg-[rgba(1,214,190,0.15)] text-[#01D6BE]'
    }
  }

  // 处理点击设备名称跳转到 Overview 页面
  const handleDeviceClick = (deviceId: string) => {
    if (isBatchMode) return
    selectDevice(deviceId)
    navigate('/')
  }

  // 切换 Batch Control 模式
  const toggleBatchMode = () => {
    setIsBatchMode(!isBatchMode)
    setSelectedDevices(new Set())
  }

  // 切换设备选择
  const toggleDeviceSelection = (deviceId: string) => {
    const newSelected = new Set(selectedDevices)
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId)
    } else {
      newSelected.add(deviceId)
    }
    setSelectedDevices(newSelected)
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedDevices.size === filteredDevices.length) {
      setSelectedDevices(new Set())
    } else {
      setSelectedDevices(new Set(filteredDevices.map(d => d.id)))
    }
  }

  // 批量操作
  const handleBatchTurnOn = () => {
    toggleDevices(Array.from(selectedDevices), true)
    setSelectedDevices(new Set())
  }

  const handleBatchTurnOff = () => {
    toggleDevices(Array.from(selectedDevices), false)
    setSelectedDevices(new Set())
  }

  const handleBatchDelete = () => {
    deleteDevices(Array.from(selectedDevices))
    setSelectedDevices(new Set())
  }

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex justify-between items-center">
        <button 
          onClick={toggleBatchMode}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors
            ${isBatchMode ? 'bg-[#01D6BE] text-[#000000]' : 'bg-[#1C1C1E] text-[#FFFFFF]'}`}
        >
          <Menu size={20} />
        </button>
        <h2 className="text-xl font-bold text-[#FFFFFF]">Device</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#FFFFFF] hover:bg-[#2C2C2E] transition-colors"
        >
          <Plus size={20} />
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
            className="w-full h-11 bg-[#1C1C1E] rounded-[28px]
              pl-11 pr-10 text-sm text-[#FFFFFF] placeholder-[#8E8E93]
              focus:outline-none transition-all duration-200"
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
                  bg-[rgba(255,255,255,0.1)] text-[#8E8E93] flex items-center justify-center"
              >
                <X size={13} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* 筛选标签 */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4 pb-1">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`
                px-4 py-2 rounded-full text-[13px] font-medium
                whitespace-nowrap transition-all duration-200
                ${activeFilter === filter
                  ? filter === 'Alerts'
                    ? 'bg-[#FF3B30] text-white'
                    : 'bg-[#01D6BE] text-[#000000]'
                  : 'bg-[#1C1C1E] text-[#8E8E93]'
                }
              `}
            >
              {filter}
              {filter === 'Alerts' && alertCount > 0 && (
                <span className={`ml-1.5
                  w-4 h-4 rounded-full text-[10px] font-bold inline-flex items-center justify-center
                  ${activeFilter === 'Alerts' ? 'bg-white text-[#FF3B30]' : 'bg-[#FF3B30] text-white'}`}>
                  {alertCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Batch Control 操作栏 */}
        <AnimatePresence>
          {isBatchMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={toggleSelectAll}
                  className="text-[12px] text-[#01D6BE] font-medium"
                >
                  {selectedDevices.size === filteredDevices.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-[12px] text-[#8E8E93]">
                  {selectedDevices.size} selected
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleBatchTurnOn}
                  disabled={selectedDevices.size === 0}
                  className="flex-1 h-10 bg-[#34C759] rounded-[12px] text-[#000000] font-semibold text-[13px]
                    flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Power size={16} />
                  Turn On
                </button>
                <button
                  onClick={handleBatchTurnOff}
                  disabled={selectedDevices.size === 0}
                  className="flex-1 h-10 bg-[#8E8E93] rounded-[12px] text-[#000000] font-semibold text-[13px]
                    flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Power size={16} />
                  Turn Off
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedDevices.size === 0}
                  className="flex-1 h-10 bg-[#FF3B30] rounded-[12px] text-[#FFFFFF] font-semibold text-[13px]
                    flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 设备列表标题 */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-[#FFFFFF]">Connected Devices</h3>
          <span className="text-[11px] px-2.5 py-1 rounded-full 
            bg-[rgba(1,214,190,0.12)] text-[#01D6BE]
            font-semibold">
            {activeCount} Active
          </span>
        </div>

        {/* 设备列表 */}
        <div className="flex flex-col gap-2.5">
          {filteredDevices.map((device) => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-3.5 p-4 bg-[#1C1C1E] rounded-[18px]
                transition-all duration-200
                ${hasAlert(device)
                  ? 'border-l-2 border-l-[#FF3B30]'
                  : ''
                }`}
            >
              {/* Batch Mode 多选框 */}
              {isBatchMode && (
                <button
                  onClick={() => toggleDeviceSelection(device.id)}
                  className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors
                    ${selectedDevices.has(device.id)
                      ? 'bg-[#01D6BE] border-[#01D6BE]'
                      : 'border-[#48484A] hover:border-[#8E8E93]'
                    }`}
                >
                  {selectedDevices.has(device.id) && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </button>
              )}

              <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0
                ${getIconColor(device.type)}`}>
                {device.type === 'powerstation' ? <Battery size={22} /> : <Zap size={22} />}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeviceClick(device.id)}
                    className="text-[14px] font-semibold text-[#FFFFFF] hover:text-[#01D6BE] transition-colors text-left"
                  >
                    {device.name}
                  </button>
                  {hasAlert(device) && (
                    <AlertTriangle size={12} className="text-[#FF3B30] flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs ${device.status === 'online' ? 'text-[#8E8E93]' : 'text-[#FF3B30]'}`}>
                    {device.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${getBatteryColor(device.batteryLevel)}`}>
                    <Battery size={11} />
                    {device.batteryLevel}%
                  </span>
                </div>
              </div>

              {!isBatchMode && (
                <ToggleSwitch
                  isOn={device.isOn}
                  onToggle={() => toggleDevice(device.id)}
                />
              )}
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
                className="mt-3 text-[12px] text-[#01D6BE] underline"
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
            className="absolute inset-0 bg-[rgba(0,0,0,0.7)] z-50 flex items-end"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#1C1C1E] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-[#FFFFFF] mb-5">Add New Device</h3>

              {!showQrScan ? (
                <>
                  <div className="flex flex-col gap-3">
                    {[
                      { label: 'Bluetooth Scan', desc: 'Find nearby BLE devices', color: '#01D6BE', icon: '📡' },
                      { label: 'Wi-Fi Setup', desc: 'Connect via local network', color: '#34C759', icon: '📶' },
                      { label: 'Manual Entry', desc: 'Enter device code manually', color: '#FF9500', icon: '⌨️' },
                      { label: 'Scan QR Code', desc: 'Scan device QR code with camera', color: '#01D6BE', icon: '📷', action: () => setShowQrScan(true) },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => {
                          if ('action' in opt && opt.action) {
                            opt.action()
                          } else {
                            setShowAddModal(false)
                          }
                        }}
                        className="flex items-center gap-4 p-4 bg-[#2C2C2E] rounded-[16px] text-left transition-all"
                      >
                        <span className="text-2xl">{opt.icon}</span>
                        <div className="flex-1">
                          <div className="text-[14px] font-semibold" style={{ color: opt.color }}>{opt.label}</div>
                          <div className="text-[11px] text-[#8E8E93] mt-0.5">{opt.desc}</div>
                        </div>
                        {'action' in opt && opt.action && (
                          <div className="w-6 h-6 rounded-full bg-[rgba(1,214,190,0.15)] flex items-center justify-center">
                            <QrCode size={14} className="text-[#01D6BE]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="w-full mt-4 h-11 rounded-[14px] bg-[rgba(255,255,255,0.06)] text-[#8E8E93] text-sm font-medium"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {/* QR Scan View */}
                  <div className="w-48 h-48 mx-auto mb-4 relative">
                    <div className="absolute inset-0 bg-[#2C2C2E] rounded-[16px] flex items-center justify-center">
                      <QrCode size={56} className="text-[rgba(1,214,190,0.3)]" />
                    </div>
                    {/* Scan line */}
                    <motion.div
                      className="absolute left-2 right-2 h-0.5 bg-[#01D6BE]"
                      animate={{ top: ['10%', '85%', '10%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                    />
                    {/* Corner markers */}
                    {([['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],
                      ['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']
                    ] as const).map(([pos, border], i) => (
                      <div key={i} className={`absolute w-5 h-5 ${pos} ${border} border-[#01D6BE] rounded-sm`} />
                    ))}
                  </div>
                  <div className="text-[15px] font-semibold text-[#FFFFFF] mb-1 text-center">Scan Device QR Code</div>
                  <div className="text-[12px] text-[#8E8E93] mb-5 text-center">Point camera at the QR code on your device</div>
                  <button
                    onClick={() => setShowQrScan(false)}
                    className="w-full h-11 rounded-[14px] bg-[rgba(255,255,255,0.06)] text-[#8E8E93] text-sm font-medium"
                  >
                    Back
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
