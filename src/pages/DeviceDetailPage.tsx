import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { 
  Battery, 
  Zap, 
  Thermometer, 
  RefreshCw,
  ChevronLeft,
  Wifi,
  Bluetooth,
  Usb,
  Calendar,
  Hash,
  Shield,
  Award,
  Pencil,
  Check,
  X,
  Trash2,
  Sun,
  Server,
  Snowflake,
  Wind,
  Plug,
  Lightbulb,
  Info,
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useDeviceStore } from '../stores/deviceStore'
import { toast } from '../components/Toast'
import appVersion from '../version.json'

interface DeviceDetailPageProps {
  onBack: () => void
}

// PRD v1.1 §4.3: Display Icon 8 种设备图标
const DEVICE_ICON_OPTIONS = [
  { key: 'powerstation', label: 'Power Station', Icon: Battery, defaultColor: '#01D6BE' },
  { key: 'fridge', label: 'Refrigerator', Icon: Snowflake, defaultColor: '#5AC8FA' },
  { key: 'cpap', label: 'CPAP', Icon: Wind, defaultColor: '#AF52DE' },
  { key: 'solar', label: 'Solar Panel', Icon: Sun, defaultColor: '#FF9500' },
  { key: 'ac', label: 'AC Unit', Icon: Zap, defaultColor: '#007AFF' },
  { key: 'server', label: 'Server/NAS', Icon: Server, defaultColor: '#34C759' },
  { key: 'light', label: 'Lighting', Icon: Lightbulb, defaultColor: '#FFD700' },
  { key: 'plug', label: 'Generic Plug', Icon: Plug, defaultColor: '#FF3B30' },
] as const

// 规格字段配置
interface SpecField {
  key: keyof typeof initialSpecs;
  icon: typeof Battery;
  label: string;
  color: string;
}

const initialSpecs = {
  batteryCapacity: '',
  batteryType: '',
  maxOutputPower: '',
  maxOutputSurge: '',
  outputType: '',
  maxChargePower: '',
  chargeMode: '',
  chargeTime: '',
  operatingTemp: '',
  optimalTemp: '',
}

export default function DeviceDetailPage({ onBack }: DeviceDetailPageProps) {
  const navigate = useNavigate()
  const { powerStation, settings, selectedDeviceId, updateDeviceNameById, updateDeviceSpecs, updateSettings } = usePowerStationStore()
  const { bleConnection, serialConnection, activeDataSource } = useConnectionStore()
  const { selectedDeviceDetails, devices, selectDevice, removeDeviceLocally } = useDeviceStore()
  
  // 设备名称编辑状态
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(powerStation.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // 规格编辑状态
  const [editingSpec, setEditingSpec] = useState<string | null>(null)
  const [editSpecValues, setEditSpecValues] = useState({
    batteryCapacity: powerStation.specs.batteryCapacity,
    batteryType: powerStation.specs.batteryType,
    maxOutputPower: powerStation.specs.maxOutputPower,
    maxOutputSurge: powerStation.specs.maxOutputSurge,
    outputType: powerStation.specs.outputType,
    maxChargePower: powerStation.specs.maxChargePower,
    chargeMode: powerStation.specs.chargeMode,
    chargeTime: powerStation.specs.chargeTime,
    operatingTemp: powerStation.specs.operatingTemp,
    optimalTemp: powerStation.specs.optimalTemp,
  })

  // PRD v1.1 §4.3: Display Icon 选择状态
  const [selectedIconKey, setSelectedIconKey] = useState<string>(
    settings.deviceIconKey ?? 'powerstation'
  )

  // PRD v1.1 §4.3: Delete Device 二次确认状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteDevice = async () => {
    if (!selectedDeviceId) return
    setDeleting(true)
    try {
      // 调用 store 的 removeDevice（前端从列表中移除；如需真实 API 后续接 /device/delete）
      removeDeviceLocally(selectedDeviceId)
      toast.success('Device removed', 'Device has been removed from your account')
      // 跳回设备列表
      onBack()
      // 切换到下一个设备或直接跳列表
      setTimeout(() => navigate('/devices', { replace: true }), 100)
    } catch (e) {
      toast.error('Remove failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const deviceSpecs = [
    { 
      icon: Battery, 
      label: 'Battery Capacity', 
      value: powerStation.specs.batteryCapacity, 
      desc: powerStation.specs.batteryType,
      color: '#01D6BE',
      editKeys: ['batteryCapacity', 'batteryType']
    },
    { 
      icon: Zap, 
      label: 'Max Output Power', 
      value: powerStation.specs.maxOutputPower, 
      desc: `Surge ${powerStation.specs.maxOutputSurge}`,
      subDesc: powerStation.specs.outputType,
      color: '#34C759',
      editKeys: ['maxOutputPower', 'maxOutputSurge', 'outputType']
    },
    { 
      icon: Zap, 
      label: 'Max Charge Power', 
      value: powerStation.specs.maxChargePower, 
      desc: powerStation.specs.chargeMode,
      subDesc: powerStation.specs.chargeTime,
      color: '#FF9500',
      editKeys: ['maxChargePower', 'chargeMode', 'chargeTime']
    },
    { 
      icon: Thermometer, 
      label: 'Operating Temp', 
      value: powerStation.specs.operatingTemp, 
      desc: `Current: ${powerStation.temperature}°C`,
      subDesc: `Optimal: ${powerStation.specs.optimalTemp}`,
      color: '#A855F7',
      editKeys: ['operatingTemp', 'optimalTemp']
    },
  ]

  const deviceStatus = [
    { 
      icon: RefreshCw, 
      label: 'Charge Cycles', 
      value: `${powerStation.cycleCount}`, 
      desc: 'Total charge cycles completed',
      color: '#01D6BE' 
    },
    { 
      icon: Calendar, 
      label: 'Manufactured', 
      value: '2024-01', 
      desc: 'Serial: SR-1000-8842',
      color: '#A0A0A5' 
    },
    { 
      icon: Hash, 
      label: 'Firmware Version', 
      value: `v${appVersion.version}`, 
      desc: `Build ${appVersion.build}`,
      color: '#A0A0A5' 
    },
  ]

  const connectionStatus = [
    {
      icon: Bluetooth,
      label: 'Bluetooth BLE',
      status: bleConnection.status === 'connected' ? 'Connected' : 'Disconnected',
      detail: bleConnection.status === 'connected' 
        ? `${bleConnection.deviceName ?? 'Device'} · ${bleConnection.rssi ? `${bleConnection.rssi} dBm` : 'Active'}`
        : 'Tap to connect in Settings',
      color: bleConnection.status === 'connected' ? '#01D6BE' : '#636366',
    },
    {
      icon: Usb,
      label: 'Serial · Modbus',
      status: serialConnection.status === 'connected' ? 'Connected' : 'Disconnected',
      detail: serialConnection.status === 'connected'
        ? 'RS485 · 9600 bps · 8N1'
        : 'Tap to connect in Settings',
      color: serialConnection.status === 'connected' ? '#A855F7' : '#636366',
    },
    {
      icon: Wifi,
      label: 'Wi-Fi',
      status: 'Connected',
      detail: 'HomeNetwork · 5GHz',
      color: '#34C759',
    },
  ]

  // 处理开始编辑设备名称
  const handleStartEditName = () => {
    setEditName(powerStation.name)
    setIsEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 100)
  }

  // 处理保存设备名称
  const handleSaveName = () => {
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== powerStation.name && selectedDeviceId) {
      updateDeviceNameById(selectedDeviceId, trimmedName)
    }
    setIsEditingName(false)
  }

  // 处理取消编辑
  const handleCancelEditName = () => {
    setEditName(powerStation.name)
    setIsEditingName(false)
  }

  // 处理输入框键盘事件
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName()
    } else if (e.key === 'Escape') {
      handleCancelEditName()
    }
  }

  // 处理开始编辑规格
  const handleStartEditSpec = (label: string) => {
    setEditSpecValues({
      batteryCapacity: powerStation.specs.batteryCapacity,
      batteryType: powerStation.specs.batteryType,
      maxOutputPower: powerStation.specs.maxOutputPower,
      maxOutputSurge: powerStation.specs.maxOutputSurge,
      outputType: powerStation.specs.outputType,
      maxChargePower: powerStation.specs.maxChargePower,
      chargeMode: powerStation.specs.chargeMode,
      chargeTime: powerStation.specs.chargeTime,
      operatingTemp: powerStation.specs.operatingTemp,
      optimalTemp: powerStation.specs.optimalTemp,
    })
    setEditingSpec(label)
  }

  // 处理保存规格
  const handleSaveSpec = () => {
    updateDeviceSpecs({
      batteryCapacity: editSpecValues.batteryCapacity,
      batteryType: editSpecValues.batteryType,
      maxOutputPower: editSpecValues.maxOutputPower,
      maxOutputSurge: editSpecValues.maxOutputSurge,
      outputType: editSpecValues.outputType,
      maxChargePower: editSpecValues.maxChargePower,
      chargeMode: editSpecValues.chargeMode,
      chargeTime: editSpecValues.chargeTime,
      operatingTemp: editSpecValues.operatingTemp,
      optimalTemp: editSpecValues.optimalTemp,
    })
    setEditingSpec(null)
  }

  // 处理取消编辑规格
  const handleCancelEditSpec = () => {
    setEditingSpec(null)
  }

  // 处理规格输入变化
  const handleSpecChange = (key: keyof typeof editSpecValues, value: string) => {
    setEditSpecValues(prev => ({ ...prev, [key]: value }))
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-50 bg-[#141414] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center
            active:scale-95 transition-transform"
        >
          <ChevronLeft size={20} className="text-[#FFFFFF]" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[#FFFFFF]">Device Details</h2>
          <p className="text-xs text-[#A0A0A5]">{powerStation.name}</p>
        </div>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-6">
        {/* 设备图标和名称 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center py-6"
        >
          <div className="w-20 h-20 rounded-[24px] bg-[#262626] border border-[rgba(1,214,190,0.2)]
            flex items-center justify-center mb-4">
            <Battery size={36} className="text-[#01D6BE]" />
          </div>
          
          {/* 可编辑的设备名称 */}
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  onBlur={handleSaveName}
                  className="text-xl font-bold text-[#FFFFFF] tracking-wide bg-transparent border-b-2 border-[#01D6BE] outline-none w-[180px] text-center"
                  maxLength={20}
                />
                <button 
                  onClick={handleSaveName}
                  className="w-7 h-7 rounded-full bg-[#01D6BE] flex items-center justify-center"
                >
                  <Check size={14} className="text-[#000000]" />
                </button>
                <button 
                  onClick={handleCancelEditName}
                  className="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center"
                >
                  <X size={14} className="text-[#A0A0A5]" />
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-[#FFFFFF]">{powerStation.name}</h3>
                <button 
                  onClick={handleStartEditName}
                  className="w-7 h-7 rounded-full bg-[#262626] flex items-center justify-center hover:bg-[#333333] transition-colors"
                >
                  <Pencil size={14} className="text-[#A0A0A5]" />
                </button>
              </>
            )}
          </div>
          <p className="text-sm text-[#A0A0A5] mt-1">Sierro 1000 Portable Power Station</p>
          
          {/* 状态标签 */}
          <div className="flex gap-2 mt-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border
              ${activeDataSource === 'bluetooth'
                ? 'bg-[rgba(1,214,190,0.12)] text-[#01D6BE] border-[rgba(1,214,190,0.3)]'
                : activeDataSource === 'serial'
                ? 'bg-[rgba(168,85,247,0.12)] text-[#A855F7] border-[rgba(168,85,247,0.3)]'
                : 'bg-[rgba(52,199,89,0.08)] text-[#34C759] border-[rgba(52,199,89,0.2)]'}`}>
              {activeDataSource === 'bluetooth' ? '● BLE Connected'
                : activeDataSource === 'serial' ? '● Serial Connected'
                : '◎ Simulator Mode'}
            </span>
            {settings.founderBadge && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium border
                bg-[rgba(255,215,0,0.12)] text-[#FFD700] border-[rgba(255,215,0,0.3)]
                flex items-center gap-1">
                <Award size={10} />
                Founding Member {settings.founderBadgeNumber !== undefined ? `#${settings.founderBadgeNumber}` : ''}
              </span>
            )}
          </div>
        </motion.div>

        {/* 设备规格 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-5"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">
              Specifications
            </div>
            <div className="text-xs text-[#636366]">Tap to edit</div>
          </div>
          <div className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
            {deviceSpecs.map((item, i) => {
              const Icon = item.icon
              const isEditing = editingSpec === item.label
              return (
                <div 
                  key={item.label}
                  onClick={() => !isEditing && handleStartEditSpec(item.label)}
                  className={`flex items-start gap-3 px-4 py-4 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors
                    ${i !== deviceSpecs.length - 1 ? 'border-b border-[rgba(1,214,190,0.08)]' : ''}`}
                >
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ 
                      backgroundColor: `${item.color}15`,
                      color: item.color 
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      // 编辑模式
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-label text-[#A0A0A5]">{item.label}</div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleSaveSpec(); }}
                              className="w-6 h-6 rounded-full bg-[#01D6BE] flex items-center justify-center"
                            >
                              <Check size={12} className="text-[#000000]" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleCancelEditSpec(); }}
                              className="w-6 h-6 rounded-full bg-[#333333] flex items-center justify-center"
                            >
                              <X size={12} className="text-[#A0A0A5]" />
                            </button>
                          </div>
                        </div>
                        {item.editKeys?.map((key) => (
                          <input
                            key={key}
                            type="text"
                            value={editSpecValues[key as keyof typeof editSpecValues]}
                            onChange={(e) => handleSpecChange(key as keyof typeof editSpecValues, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-label bg-[#333333] border border-[#3C3C3E] rounded-md px-2 py-1 text-[#FFFFFF] outline-none focus:border-[#01D6BE]"
                            placeholder={key}
                          />
                        ))}
                      </div>
                    ) : (
                      // 显示模式
                      <>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="text-label text-[#A0A0A5]">{item.label}</div>
                          <div className="text-body-md font-bold text-[#FFFFFF]">{item.value}</div>
                        </div>
                        <div className="text-caption text-[#FFFFFF] font-medium">{item.desc}</div>
                        {item.subDesc && <div className="text-xs text-[#636366] mt-0.5">{item.subDesc}</div>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* 设备状态 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-5"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Device Status
          </div>
          <div className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
            {deviceStatus.map((item, i) => {
              const Icon = item.icon
              return (
                <div 
                  key={item.label}
                  className={`flex items-center gap-3 px-4 py-3.5 
                    ${i !== deviceStatus.length - 1 ? 'border-b border-[rgba(1,214,190,0.08)]' : ''}`}
                >
                  <div 
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ 
                      backgroundColor: `${item.color}15`,
                      color: item.color 
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#FFFFFF]">{item.label}</div>
                    <div className="text-caption text-[#A0A0A5] mt-0.5">{item.desc}</div>
                  </div>
                  <div className="text-[13px] font-semibold" style={{ color: item.color }}>
                    {item.value}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* PRD v1.1 §4.3: Display Icon 设备图标 8 选 1 + 颜色 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="mb-5"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Display Icon
          </div>
          <div className="bg-[#262626] rounded-[20px] p-4">
            <div className="grid grid-cols-4 gap-2 mb-3">
              {DEVICE_ICON_OPTIONS.map((opt) => {
                const Icon = opt.Icon
                const isActive = selectedIconKey === opt.key
                const color = settings.deviceIconColor ?? opt.defaultColor
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setSelectedIconKey(opt.key)
                      updateSettings({ deviceIconKey: opt.key })
                    }}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-l transition-all
                      ${isActive
                        ? 'bg-[rgba(1,214,190,0.12)] border border-[#01D6BE]'
                        : 'bg-[#333333] border border-transparent hover:bg-[#3C3C3E]'
                      }`}
                    aria-label={`Set display icon to ${opt.label}`}
                    aria-pressed={isActive}
                  >
                    <Icon size={22} style={{ color: isActive ? '#01D6BE' : color }} />
                    <span className={`text-xs ${isActive ? 'text-[#01D6BE] font-semibold' : 'text-[#A0A0A5]'}`}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="pt-3 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-xs text-[#A0A0A5] mb-2 px-1">Icon Color</div>
              <div className="grid grid-cols-5 gap-2">
                {['#01D6BE', '#34C759', '#FF9500', '#FF3B30', '#FFD700', '#AF52DE', '#5AC8FA', '#007AFF', '#8E8E93', '#FFFFFF'].map((color) => (
                  <button
                    key={color}
                    onClick={() => updateSettings({ deviceIconColor: color })}
                    className={`w-10 h-10 rounded-full transition-transform hover:scale-110 ${
                      settings.deviceIconColor === color ? 'ring-2 ring-[#FFFFFF] ring-offset-2 ring-offset-[#262626]' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Set icon color to ${color}`}
                    aria-pressed={settings.deviceIconColor === color}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* PRD v1.1 §4.3: Sleep Mode + Battery Mode */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          className="mb-5"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Device Settings
          </div>
          <div className="bg-[#262626] rounded-[20px] overflow-hidden">
            {/* Sleep Mode */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[rgba(1,214,190,0.1)]">
                <Battery size={16} className="text-[#01D6BE]" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Sleep Mode</div>
                <div className="text-caption text-[#A0A0A5]">Turn off display to save energy</div>
              </div>
              <button
                onClick={() => {
                  // PRD: 切换 Sleep Mode
                  // API: /remote/device/config/write
                }}
                className={`w-12 h-7 rounded-full transition-colors relative
                  ${settings.sleepMode ? 'bg-[#01D6BE]' : 'bg-[#636366]'}`}
                aria-label="Toggle Sleep Mode"
              >
                <div
                  className="w-5 h-5 rounded-full bg-[#FFFFFF] absolute top-1 transition-left"
                  style={{ left: settings.sleepMode ? '26px' : '4px' }}
                />
              </button>
            </div>

            {/* Battery Mode */}
            <div className="px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
              <div className="text-[13px] font-semibold text-[#FFFFFF] mb-3">Battery Mode</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 0, label: 'Normal', desc: 'Standard operation' },
                  { value: 1, label: 'Backup', desc: 'Reserve for outage' },
                  { value: 2, label: 'Eco', desc: 'Extend lifespan' },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => {
                      // PRD: 切换 Battery Mode
                      // API: /remote/device/config/write, key: workMode
                    }}
                    className={`p-3 rounded-l text-center transition-colors
                      ${settings.batteryMode === mode.value
                        ? 'bg-[rgba(1,214,190,0.15)] border border-[#01D6BE]'
                        : 'bg-[#333333] border border-transparent'
                      }`}
                  >
                    <div className={`text-label font-semibold ${settings.batteryMode === mode.value ? 'text-[#01D6BE]' : 'text-[#FFFFFF]'}`}>
                      {mode.label}
                    </div>
                    <div className="text-xs text-[#636366] mt-0.5">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Smart Schedule Entry */}
            <div
              onClick={() => window.location.href = '/smart-schedule'}
              className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#333333] transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[rgba(1,214,190,0.1)]">
                <Calendar size={16} className="text-[#01D6BE]" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Smart Schedule</div>
                <div className="text-caption text-[#A0A0A5]">Manage peak shaving schedule</div>
              </div>
              <ChevronLeft size={18} className="text-[#636366] rotate-180" />
            </div>
          </div>
        </motion.div>

        {/* PRD v1.1 §4.3: Danger Zone — Delete Device + Factory Reset */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
          className="mb-5"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Danger Zone
          </div>
          <div className="bg-[#262626] rounded-[20px] p-4 space-y-3">
            {/* Factory Reset */}
            <button
              onClick={() => {
                if (window.confirm('Reset device to factory settings? Local customizations will be lost.')) {
                  toast.info('Factory Reset', 'This action would be sent to the device in production')
                }
              }}
              className="w-full h-11 rounded-l bg-[rgba(255,149,0,0.1)] text-[#FF9500] text-[13px] font-semibold
                border border-[rgba(255,149,0,0.3)]
                hover:bg-[rgba(255,149,0,0.18)] transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} /> Factory Reset
            </button>

            {/* Delete Device — PRD v1.1 §4.3 二次确认 */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full h-11 rounded-l bg-[rgba(255,59,48,0.1)] text-[#FF3B30] text-[13px] font-semibold
                border border-[rgba(255,59,48,0.3)]
                hover:bg-[rgba(255,59,48,0.18)] transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={14} /> Delete Device
            </button>
            <p className="text-xs text-[#636366] text-center">
              Deleting will remove the device from your account. Historical data is kept for 30 days in the recycle bin.
            </p>
          </div>
        </motion.div>

        {/* 连接状态 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-5"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Connection Status
          </div>
          <div className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
            {connectionStatus.map((item, i) => {
              const Icon = item.icon
              return (
                <div 
                  key={item.label}
                  className={`flex items-center gap-3 px-4 py-3.5 
                    ${i !== connectionStatus.length - 1 ? 'border-b border-[rgba(1,214,190,0.08)]' : ''}`}
                >
                  <div 
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ 
                      backgroundColor: `${item.color}15`,
                      color: item.color 
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#FFFFFF]">{item.label}</div>
                    <div className="text-caption text-[#A0A0A5] mt-0.5">{item.detail}</div>
                  </div>
                  <div 
                    className="text-caption px-2 py-0.5 rounded-full font-medium"
                    style={{ 
                      backgroundColor: `${item.color}15`,
                      color: item.color 
                    }}
                  >
                    {item.status}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* 安全信息 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-5"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Safety & Certifications
          </div>
          <div className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-[rgba(52,199,89,0.1)] flex items-center justify-center flex-shrink-0">
                <Shield size={16} className="text-[#34C759]" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Safety Certified</div>
                <div className="text-caption text-[#A0A0A5]">UL2743, CE, FCC, PSE, RoHS</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['BMS Protection', 'Overcharge Protection', 'Short Circuit Protection', 'Temperature Control'].map((tag) => (
                <span 
                  key={tag} 
                  className="text-xs px-2 py-1 rounded-full bg-[rgba(255,255,255,0.05)] text-[#A0A0A5]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 底部信息 */}
        <div className="text-center pt-4 text-caption text-[#636366]">
          <div>Sierro Inc.</div>
          <div className="mt-1">Made with precision in Shenzhen</div>
        </div>
      </div>

      {/* PRD v1.1 §4.3: Delete Device 二次确认 Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
            onClick={() => !deleting && setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#262626] rounded-[28px] border border-[rgba(255,59,48,0.2)] overflow-hidden"
              role="alertdialog"
              aria-labelledby="delete-device-title"
              aria-describedby="delete-device-desc"
            >
              <div className="p-5 space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-[rgba(255,59,48,0.15)] flex items-center justify-center mx-auto mb-3">
                    <Trash2 size={24} className="text-[#FF3B30]" />
                  </div>
                  <h3 id="delete-device-title" className="text-base font-bold text-[#FFFFFF] mb-2">Delete this device?</h3>
                  <p id="delete-device-desc" className="text-[13px] text-[#A0A0A5]">
                    "{powerStation.name}" will be removed from your account. Historical data is kept for 30 days in case you want to recover it.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 py-3 rounded-l bg-[rgba(255,255,255,0.06)] text-[#FFFFFF] font-semibold text-[13px] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteDevice}
                    disabled={deleting}
                    className="flex-1 py-3 rounded-l bg-[rgba(255,59,48,0.15)] text-[#FF3B30] font-semibold text-[13px] border border-[rgba(255,59,48,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                    aria-label="Confirm delete device"
                  >
                    {deleting ? (
                      <><RefreshCw size={14} className="animate-spin" /> Deleting…</>
                    ) : (
                      <><Trash2 size={14} /> Delete</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
