import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import appVersion from '../version.json'

interface DeviceDetailPageProps {
  onBack: () => void
}

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
  const { powerStation, settings, selectedDeviceId, updateDeviceNameById, updateDeviceSpecs } = usePowerStationStore()
  const { bleConnection, serialConnection, activeDataSource } = useConnectionStore()
  
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
      color: '#8E8E93' 
    },
    { 
      icon: Hash, 
      label: 'Firmware Version', 
      value: `v${appVersion.version}`, 
      desc: `Build ${appVersion.build}`,
      color: '#8E8E93' 
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
      color: bleConnection.status === 'connected' ? '#01D6BE' : '#48484A',
    },
    {
      icon: Usb,
      label: 'Serial · Modbus',
      status: serialConnection.status === 'connected' ? 'Connected' : 'Disconnected',
      detail: serialConnection.status === 'connected'
        ? 'RS485 · 9600 bps · 8N1'
        : 'Tap to connect in Settings',
      color: serialConnection.status === 'connected' ? '#A855F7' : '#48484A',
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
      className="fixed inset-0 z-50 bg-[#000000] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center
            active:scale-95 transition-transform"
        >
          <ChevronLeft size={20} className="text-[#FFFFFF]" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[#FFFFFF]">Device Details</h2>
          <p className="text-xs text-[#8E8E93]">{powerStation.name}</p>
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
          <div className="w-20 h-20 rounded-[24px] bg-[#1C1C1E] border border-[rgba(1,214,190,0.2)]
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
                  className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center"
                >
                  <X size={14} className="text-[#8E8E93]" />
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-[#FFFFFF]">{powerStation.name}</h3>
                <button 
                  onClick={handleStartEditName}
                  className="w-7 h-7 rounded-full bg-[#1C1C1E] flex items-center justify-center hover:bg-[#2C2C2E] transition-colors"
                >
                  <Pencil size={14} className="text-[#8E8E93]" />
                </button>
              </>
            )}
          </div>
          <p className="text-sm text-[#8E8E93] mt-1">Sierro 1000 Portable Power Station</p>
          
          {/* 状态标签 */}
          <div className="flex gap-2 mt-3">
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium border
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
              <span className="text-[10px] px-2.5 py-1 rounded-full font-medium border
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
            <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase">
              Specifications
            </div>
            <div className="text-[10px] text-[#48484A]">Tap to edit</div>
          </div>
          <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
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
                          <div className="text-[12px] text-[#8E8E93]">{item.label}</div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleSaveSpec(); }}
                              className="w-6 h-6 rounded-full bg-[#01D6BE] flex items-center justify-center"
                            >
                              <Check size={12} className="text-[#000000]" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleCancelEditSpec(); }}
                              className="w-6 h-6 rounded-full bg-[#2C2C2E] flex items-center justify-center"
                            >
                              <X size={12} className="text-[#8E8E93]" />
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
                            className="w-full text-[12px] bg-[#2C2C2E] border border-[#3C3C3E] rounded-md px-2 py-1 text-[#FFFFFF] outline-none focus:border-[#01D6BE]"
                            placeholder={key}
                          />
                        ))}
                      </div>
                    ) : (
                      // 显示模式
                      <>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="text-[12px] text-[#8E8E93]">{item.label}</div>
                          <div className="text-[14px] font-bold text-[#FFFFFF]">{item.value}</div>
                        </div>
                        <div className="text-[11px] text-[#FFFFFF] font-medium">{item.desc}</div>
                        {item.subDesc && <div className="text-[10px] text-[#48484A] mt-0.5">{item.subDesc}</div>}
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
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3 px-1">
            Device Status
          </div>
          <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
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
                    <div className="text-[11px] text-[#8E8E93] mt-0.5">{item.desc}</div>
                  </div>
                  <div className="text-[13px] font-semibold" style={{ color: item.color }}>
                    {item.value}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* 连接状态 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-5"
        >
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3 px-1">
            Connection Status
          </div>
          <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
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
                    <div className="text-[11px] text-[#8E8E93] mt-0.5">{item.detail}</div>
                  </div>
                  <div 
                    className="text-[11px] px-2 py-0.5 rounded-full font-medium"
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
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3 px-1">
            Safety & Certifications
          </div>
          <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-[rgba(52,199,89,0.1)] flex items-center justify-center flex-shrink-0">
                <Shield size={16} className="text-[#34C759]" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Safety Certified</div>
                <div className="text-[11px] text-[#8E8E93]">UL2743, CE, FCC, PSE, RoHS</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['BMS Protection', 'Overcharge Protection', 'Short Circuit Protection', 'Temperature Control'].map((tag) => (
                <span 
                  key={tag} 
                  className="text-[10px] px-2 py-1 rounded-full bg-[rgba(255,255,255,0.05)] text-[#8E8E93]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 底部信息 */}
        <div className="text-center pt-4 text-[11px] text-[#48484A]">
          <div>Sierro Technology Co., Ltd.</div>
          <div className="mt-1">Made with precision in Shenzhen</div>
        </div>
      </div>
    </motion.div>
  )
}
