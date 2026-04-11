import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Menu, User, Search, Zap, Battery, AlertTriangle, X, Plus, QrCode, Trash2, Power, Bluetooth, RefreshCw } from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import { getBleManager, destroyBleManager } from '../protocols/bleManager'
import type { ConnectionInfo, BlePowerPacket } from '../types/protocol'

const filters = ['All', 'Online', 'Offline', 'Alerts']

// 蓝牙设备类型
interface BleDevice {
  id: string
  name: string
  rssi?: number
}

export default function DevicePage() {
  const navigate = useNavigate()
  const { devices, toggleDevice, selectDevice, toggleDevices, deleteDevices } = usePowerStationStore()
  const { setBleConnection } = useConnectionStore()
  const [activeFilter, setActiveFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showQrScan, setShowQrScan] = useState(false)
  const [showBleScan, setShowBleScan] = useState(false)
  
  // Batch Control 模式
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())
  
  // BLE 扫描状态
  const [isScanning, setIsScanning] = useState(false)
  const [scannedDevices, setScannedDevices] = useState<BleDevice[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const bleManagerRef = useRef<ReturnType<typeof getBleManager> | null>(null)
  
  // QR 扫描状态
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrScanning, setQrScanning] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)

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

  // ---- BLE 扫描功能 ------------------------------------------------
  
  const handleBluetoothScan = async () => {
    setShowAddModal(false)
    setShowBleScan(true)
    setIsScanning(true)
    setScanError(null)
    setScannedDevices([])
    
    try {
      // 检查浏览器支持
      if (!navigator.bluetooth) {
        setScanError('当前浏览器不支持 Web Bluetooth，请使用 Chrome 或 Edge')
        setIsScanning(false)
        return
      }
      
      // 创建 BLE Manager
      const bleManager = getBleManager({
        onStatusChange: (info: ConnectionInfo) => {
          setBleConnection(info)
          if (info.status === 'connected' && info.deviceName) {
            // 连接成功，添加到扫描列表
            setScannedDevices(prev => {
              const exists = prev.find(d => d.id === info.deviceId)
              if (exists) return prev
              return [...prev, { 
                id: info.deviceId || '', 
                name: info.deviceName || 'Unknown Device',
                rssi: info.rssi 
              }]
            })
            setIsScanning(false)
          } else if (info.status === 'error') {
            setScanError(info.errorMessage || '扫描失败')
            setIsScanning(false)
          }
        },
        onPowerData: (packet: BlePowerPacket) => {
          console.log('Power data:', packet)
        },
        onBatteryLevel: (level: number) => {
          console.log('Battery level:', level)
        },
        onPortStatus: (bitmap: number) => {
          console.log('Port status:', bitmap)
        },
        onModeChange: (mode: string) => {
          console.log('Mode changed:', mode)
        },
      })
      
      bleManagerRef.current = bleManager
      
      // 开始扫描并连接
      await bleManager.connect()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User cancelled')) {
        setScanError(msg)
      }
      setIsScanning(false)
    }
  }
  
  const handleConnectDevice = async (deviceId: string) => {
    // 设备已连接，关闭弹窗
    setShowBleScan(false)
    // 可以在这里添加更多连接后的逻辑
  }
  
  const handleCloseBleScan = () => {
    setShowBleScan(false)
    setIsScanning(false)
    setScanError(null)
    setScannedDevices([])
  }

  // ---- QR Code 扫描功能 ------------------------------------------------
  
  useEffect(() => {
    if (showQrScan && !qrResult) {
      startQrScan()
    }
    
    return () => {
      stopQrScan()
    }
  }, [showQrScan])
  
  const startQrScan = async () => {
    setQrScanning(true)
    setQrError(null)
    setQrResult(null)
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        
        // 开始检测二维码
        scanQrCode()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setQrError(`无法访问摄像头: ${msg}`)
      setQrScanning(false)
    }
  }
  
  const stopQrScan = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    
    setQrScanning(false)
  }
  
  const scanQrCode = () => {
    if (!videoRef.current || !canvasRef.current) return
    
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanQrCode)
      return
    }
    
    // 设置 canvas 尺寸
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    // 绘制视频帧
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    
    // 使用 jsQR 库解析二维码（需要安装）
    // 这里使用简单的字符串检测作为示例
    // 实际项目中应该使用 jsQR 或其他二维码库
    
    // 模拟二维码检测（实际项目中替换为真实检测）
    // 这里我们检测视频中心区域的亮度变化来模拟
    const centerX = Math.floor(canvas.width / 2)
    const centerY = Math.floor(canvas.height / 2)
    const size = 100
    
    // 简单的二维码模拟检测
    // 实际应该使用: import jsQR from 'jsqr'
    // const code = jsQR(imageData.data, imageData.width, imageData.height)
    
    // 继续扫描
    if (!qrResult) {
      animationFrameRef.current = requestAnimationFrame(scanQrCode)
    }
  }
  
  const handleCloseQrScan = () => {
    stopQrScan()
    setShowQrScan(false)
    setQrResult(null)
    setQrError(null)
  }
  
  // 模拟二维码扫描成功（用于测试）
  const simulateQrScan = () => {
    stopQrScan()
    setQrResult('DEVICE_ID:SIERRA_1000_ABC123\nMODEL:SIERRA 1000\nSN:SN202403001')
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

              <div className="flex flex-col gap-3">
                {[
                  { label: 'Bluetooth Scan', desc: 'Find nearby BLE devices', color: '#01D6BE', icon: '📡', action: handleBluetoothScan },
                  { label: 'Wi-Fi Setup', desc: 'Connect via local network', color: '#34C759', icon: '📶' },
                  { label: 'Manual Entry', desc: 'Enter device code manually', color: '#FF9500', icon: '⌨️' },
                  { label: 'Scan QR Code', desc: 'Scan device QR code with camera', color: '#01D6BE', icon: '📷', action: () => { setShowAddModal(false); setShowQrScan(true) } },
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* BLE Scan Modal */}
      <AnimatePresence>
        {showBleScan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-50 flex items-center justify-center p-5"
            onClick={handleCloseBleScan}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#1C1C1E] rounded-[24px] p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#FFFFFF]">Bluetooth Devices</h3>
                <button
                  onClick={handleCloseBleScan}
                  className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93]"
                >
                  <X size={18} />
                </button>
              </div>
              
              {isScanning && scannedDevices.length === 0 && !scanError && (
                <div className="flex flex-col items-center justify-center py-10">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 rounded-full border-2 border-[#01D6BE] border-t-transparent mb-4"
                  />
                  <p className="text-[14px] text-[#8E8E93]">Scanning for devices...</p>
                  <p className="text-[11px] text-[#48484A] mt-1">Make sure your device is in pairing mode</p>
                </div>
              )}
              
              {scanError && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[rgba(255,59,48,0.15)] flex items-center justify-center mb-3">
                    <Bluetooth size={24} className="text-[#FF3B30]" />
                  </div>
                  <p className="text-[14px] text-[#FF3B30] text-center mb-1">Scan Failed</p>
                  <p className="text-[12px] text-[#8E8E93] text-center px-4">{scanError}</p>
                  <button
                    onClick={handleBluetoothScan}
                    className="mt-4 px-5 py-2 bg-[#01D6BE] rounded-full text-[#000000] text-[13px] font-semibold flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Retry
                  </button>
                </div>
              )}
              
              {scannedDevices.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[12px] text-[#8E8E93] mb-3">Found {scannedDevices.length} device(s)</p>
                  {scannedDevices.map((device) => (
                    <motion.div
                      key={device.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 p-4 bg-[#2C2C2E] rounded-[16px]"
                    >
                      <div className="w-10 h-10 rounded-full bg-[rgba(1,214,190,0.15)] flex items-center justify-center">
                        <Bluetooth size={20} className="text-[#01D6BE]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-semibold text-[#FFFFFF]">{device.name}</p>
                        <p className="text-[11px] text-[#8E8E93]">
                          {device.rssi ? `Signal: ${device.rssi} dBm` : 'Signal: Unknown'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleConnectDevice(device.id)}
                        className="px-4 py-2 bg-[#01D6BE] rounded-full text-[#000000] text-[12px] font-semibold"
                      >
                        Connect
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
              
              {!isScanning && !scanError && scannedDevices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[#2C2C2E] flex items-center justify-center mb-3">
                    <Bluetooth size={24} className="text-[#8E8E93]" />
                  </div>
                  <p className="text-[14px] text-[#8E8E93]">No devices found</p>
                  <button
                    onClick={handleBluetoothScan}
                    className="mt-4 px-5 py-2 bg-[#01D6BE] rounded-full text-[#000000] text-[13px] font-semibold flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Scan Again
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* QR Scan Modal */}
      <AnimatePresence>
        {showQrScan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.9)] z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 safe-area-top">
              <h3 className="text-lg font-bold text-[#FFFFFF]">Scan QR Code</h3>
              <button
                onClick={handleCloseQrScan}
                className="w-9 h-9 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#FFFFFF]"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Camera View */}
            <div className="flex-1 flex flex-col items-center justify-center px-5">
              {!qrResult ? (
                <>
                  <div className="relative w-64 h-64 mb-6">
                    {/* Hidden video element */}
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover rounded-[20px]"
                      playsInline
                      muted
                    />
                    {/* Hidden canvas for processing */}
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Scan overlay */}
                    <div className="absolute inset-0 border-2 border-[#01D6BE] rounded-[20px]">
                      {/* Corner markers */}
                      {([
                        ['top-0 left-0', 'border-t-4 border-l-4'],
                        ['top-0 right-0', 'border-t-4 border-r-4'],
                        ['bottom-0 left-0', 'border-b-4 border-l-4'],
                        ['bottom-0 right-0', 'border-b-4 border-r-4']
                      ] as const).map(([pos, border], i) => (
                        <div key={i} className={`absolute w-8 h-8 ${pos} ${border} border-[#01D6BE] rounded-sm`} />
                      ))}
                      
                      {/* Scan line */}
                      {qrScanning && (
                        <motion.div
                          className="absolute left-2 right-2 h-0.5 bg-[#01D6BE] shadow-[0_0_10px_#01D6BE]"
                          animate={{ top: ['5%', '95%', '5%'] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                        />
                      )}
                    </div>
                    
                    {/* Placeholder when no camera */}
                    {!qrScanning && !qrError && (
                      <div className="absolute inset-0 bg-[#1C1C1E] rounded-[20px] flex items-center justify-center">
                        <QrCode size={64} className="text-[#48484A]" />
                      </div>
                    )}
                  </div>
                  
                  {qrError ? (
                    <div className="text-center">
                      <p className="text-[14px] text-[#FF3B30] mb-2">{qrError}</p>
                      <button
                        onClick={startQrScan}
                        className="px-5 py-2 bg-[#01D6BE] rounded-full text-[#000000] text-[13px] font-semibold"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-[15px] font-semibold text-[#FFFFFF] mb-1">Point camera at QR code</p>
                      <p className="text-[12px] text-[#8E8E93]">The code will be scanned automatically</p>
                      
                      {/* Test button for development */}
                      <button
                        onClick={simulateQrScan}
                        className="mt-6 px-4 py-2 bg-[#2C2C2E] rounded-full text-[#8E8E93] text-[12px]"
                      >
                        Simulate Scan (Test)
                      </button>
                    </>
                  )}
                </>
              ) : (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full max-w-sm bg-[#1C1C1E] rounded-[24px] p-6"
                >
                  <div className="w-16 h-16 rounded-full bg-[rgba(52,199,89,0.15)] flex items-center justify-center mx-auto mb-4">
                    <QrCode size={32} className="text-[#34C759]" />
                  </div>
                  <h4 className="text-lg font-bold text-[#FFFFFF] text-center mb-2">QR Code Scanned!</h4>
                  <div className="bg-[#2C2C2E] rounded-[12px] p-4 mb-5">
                    <pre className="text-[12px] text-[#8E8E93] whitespace-pre-wrap break-all">{qrResult}</pre>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setQrResult(null); startQrScan() }}
                      className="flex-1 h-11 rounded-[14px] bg-[#2C2C2E] text-[#FFFFFF] text-[14px] font-medium"
                    >
                      Scan Again
                    </button>
                    <button
                      onClick={() => {
                        // 解析二维码数据并添加设备
                        console.log('Adding device with QR data:', qrResult)
                        handleCloseQrScan()
                      }}
                      className="flex-1 h-11 rounded-[14px] bg-[#01D6BE] text-[#000000] text-[14px] font-semibold"
                    >
                      Add Device
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
            
            {/* Bottom hint */}
            <div className="p-5 safe-area-bottom text-center">
              <p className="text-[11px] text-[#48484A]">Make sure the QR code is well-lit and in focus</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
