import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { 
  Battery, 
  Zap, 
  Thermometer, 
  RefreshCw,
  Wifi,
  Bluetooth,
  Cloud,
  Bell,
  Moon,
  Globe,
  Download,
  AlertTriangle,
  ChevronRight,
  BatteryCharging,
  Usb,
  Link2,
  Link2Off,
  Loader2,
  Signal,
  Database,
  Activity,
  X,
  Send,
  CheckCircle,
  Shield,
  FileText,
  Headphones,
  Mail,
} from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useProtocol } from '../hooks/useProtocol'
import { getDBStats, clearAllHistory } from '../db/powerflowDB'
import appVersion from '../version.json'

export default function SettingsPage() {
  const { powerStation, settings, updateSettings } = usePowerStationStore()
  const { bleConnection, serialConnection, activeDataSource, bleSupported, serialSupported } = useConnectionStore()
  const { connectBle, disconnectBle, connectSerial, disconnectSerial } = useProtocol()
  const [dbStats, setDbStats] = useState<Record<string, number> | null>(null)
  const [showDbPanel, setShowDbPanel] = useState(false)
  
  // 弹窗状态
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  
  // Support 表单
  const [supportEmail, setSupportEmail] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [supportSubmitted, setSupportSubmitted] = useState(false)

  // 加载 DB 统计
  useEffect(() => {
 if (showDbPanel) {
 getDBStats().then(setDbStats).catch(() => setDbStats(null))
 }
  }, [showDbPanel])

  const handleBleToggle = async () => {
 if (bleConnection.status === 'connected') {
 await disconnectBle()
 } else {
 await connectBle()
 }
  }

  const handleSerialToggle = async () => {
 if (serialConnection.status === 'connected') {
 await disconnectSerial()
 } else {
 await connectSerial()
 }
  }

  const handleClearDB = async () => {
 await clearAllHistory()
 const stats = await getDBStats()
 setDbStats(stats)
  }
  
  const handleSupportSubmit = (e: React.FormEvent) => {
 e.preventDefault()
 // 模拟提交
 setSupportSubmitted(true)
 setTimeout(() => {
 setShowSupport(false)
 setSupportEmail('')
 setSupportMessage('')
 setSupportSubmitted(false)
 }, 1500)
  }

  const deviceInfo = [
 { icon: Battery, label: 'Battery Capacity', value: '1000Wh', desc: 'LiFePO₄ · LFP Cells', color: 'blue' },
 { icon: Zap, label: 'Max Charge Power', value: '500W', desc: 'AC + Solar Simultaneous', color: 'green' },
 { icon: Thermometer, label: 'Current Temp', value: `${powerStation.temperature}°C`, desc: 'Ambient: 26°C', color: 'orange' },
 { icon: RefreshCw, label: 'Charge Cycles', value: `${powerStation.cycleCount}`, desc: '~7,714 cycles remaining', color: 'purple' },
  ]

  const systemItems = [
 { icon: Bell, label: 'Push Notifications', desc: 'Low Battery, Full, Alert', type: 'toggle' as const, color: 'orange', storeKey: 'notifications' as const },
 { icon: Moon, label: 'Do Not Disturb', desc: `${settings.doNotDisturbStart} — ${settings.doNotDisturbEnd}`, type: 'toggle' as const, color: 'gray', storeKey: 'doNotDisturb' as const },
 { icon: Globe, label: 'Language / Units', desc: 'English · Metric', type: 'nav' as const, color: 'gray', storeKey: null },
 { icon: Download, label: 'Firmware Update', desc: `App v${appVersion.version} (Build ${appVersion.build}) · Up to date`, type: 'badge' as const, color: 'green', storeKey: null },
 { icon: AlertTriangle, label: 'Factory Reset', desc: 'Clear all data and settings', type: 'nav-danger' as const, color: 'red', storeKey: null },
  ]

  const colorClasses: Record<string, { bg: string; text: string }> = {
 blue: { bg: 'bg-[rgba(1,214,190,0.1)]', text: 'text-[#01D6BE]' },
 green: { bg: 'bg-[rgba(52,199,89,0.1)]', text: 'text-[#34C759]' },
 orange: { bg: 'bg-[rgba(255,149,0,0.1)]', text: 'text-[#FF9500]' },
 purple: { bg: 'bg-[rgba(168,85,247,0.1)]', text: 'text-[#A855F7]' },
 red: { bg: 'bg-[rgba(255,59,48,0.1)]', text: 'text-[#FF3B30]' },
 gray: { bg: 'bg-[rgba(255,255,255,0.06)]', text: 'text-[#8E8E93]' },
  }
  
  // Privacy Policy 内容
  const privacyContent = [
 { title: '1. Information We Collect', content: 'We collect device usage data, battery statistics, and connection logs to provide better service. Personal information is only collected when you voluntarily provide it through support requests.' },
 { title: '2. How We Use Your Data', content: 'Your data is used to improve app performance, provide personalized recommendations, and troubleshoot technical issues. We never sell your personal information to third parties.' },
 { title: '3. Data Storage & Security', content: 'All data is stored locally on your device using encrypted IndexedDB. Cloud sync is optional and uses industry-standard encryption (TLS 1.3) for data transmission.' },
 { title: '4. Bluetooth & Location', content: 'Bluetooth permissions are required to connect to your power station. Location permission is not collected or stored.' },
 { title: '5. Your Rights', content: 'You can export or delete all your data at any time through the Factory Reset option. Contact support for data portability requests.' },
  ]
  
  // Terms of Use 内容
  const termsContent = [
 { title: '1. Acceptance of Terms', content: 'By using Sierro App, you agree to these Terms of Use. If you do not agree, please do not use the application.' },
 { title: '2. License Grant', content: 'We grant you a limited, non-exclusive, non-transferable license to use the app for personal, non-commercial purposes on devices you own or control.' },
 { title: '3. Prohibited Activities', content: 'You may not: reverse engineer the app, use it for illegal purposes, interfere with other users, or attempt to gain unauthorized access to our systems.' },
 { title: '4. Disclaimer of Warranties', content: 'The app is provided "as is" without warranties of any kind. We do not guarantee uninterrupted service or that the app will meet your specific requirements.' },
 { title: '5. Limitation of Liability', content: 'To the maximum extent permitted by law, Sierro Technology shall not be liable for any indirect, incidental, or consequential damages arising from app usage.' },
 { title: '6. Changes to Terms', content: 'We may update these terms from time to time. Continued use of the app after changes constitutes acceptance of the new terms.' },
  ]

  return (
 <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
 {/* Header */}
 <div className="px-5 pt-4 pb-4 safe-area-top">
 <h2 className="text-xl font-bold text-[#FFFFFF]">Device & Settings</h2>
 <p className="text-xs text-[#8E8E93] mt-1">Manage Connections & System Config</p>
 </div>

 {/* 可滚动内容 */}
 <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
 {/* 设备卡片 */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.2)] rounded-[28px] p-4 mb-4
flex items-center gap-4 relative overflow-hidden"
>
<div className="absolute top-0 left-0 right-0 h-px bg-[#2C2C2E]" />
 
 <div className="w-[60px] h-[60px] rounded-[20px] 
 bg-[rgba(1,214,190,0.08)]
 border border-[rgba(1,214,190,0.3)]
 flex items-center justify-center (1,214,190,0.15)]
 flex-shrink-0">
 <BatteryCharging size={28} className="text-[#01D6BE]" />
 </div>
 
 <div className="flex-1">
 <h3 className="text-base font-bold text-[#FFFFFF]">{powerStation.name}</h3>
 <p className="text-[11px] text-[#8E8E93] mt-0.5">Model · {powerStation.model} · S/N:{powerStation.serialNumber.slice(-5)}</p>
 <div className="flex gap-2 mt-2">
 <span className="text-[10px] px-2 py-0.5 rounded-full 
 bg-[rgba(1,214,190,0.1)] text-[#01D6BE] border border-[rgba(1,214,190,0.2)]
 font-semibold">
 FW v{appVersion.version}
 </span>
 <span className="text-[10px] px-2 py-0.5 rounded-full 
 bg-[rgba(1,214,190,0.1)] text-[#01D6BE] border border-[rgba(1,214,190,0.2)]
 font-semibold">
 BT 5.0
 </span>
 <span className="text-[10px] px-2 py-0.5 rounded-full 
 bg-[rgba(1,214,190,0.1)] text-[#01D6BE] border border-[rgba(1,214,190,0.2)]
 font-semibold">
 Wi-Fi
 </span>
 </div>
 </div>
 
 <div className="flex flex-col items-center gap-1">
 <div className="flex items-end gap-0.5 h-[18px]">
 {[5, 9, 13, 17].map((h, i) => (
 <div 
 key={i}
 className="w-1 rounded-sm bg-[#34C759] (52,199,89,0.4)]"
 style={{ height: `${h}px` }}
 />
 ))}
 </div>
 <div className="text-[9px] text-[#34C759] font-semibold">STRONG</div>
 </div>
 </motion.div>

 {/* 设备信息 */}
 <div className="mb-4">
 <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2 px-1">
 Device Info
 </div>
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
 {deviceInfo.map((item, i) => {
 const Icon = item.icon
 const colors = colorClasses[item.color]
 return (
 <div 
 key={item.label}
 className={`flex items-center gap-3 px-4 py-3.5 
 ${i !== deviceInfo.length - 1 ? 'border-b border-[rgba(1,214,190,0.08)]' : ''}`}
 >
 <div className={`w-9 h-9 rounded-lg ${colors.bg} ${colors.text} 
 flex items-center justify-center flex-shrink-0`}>
 <Icon size={16} />
 </div>
 <div className="flex-1">
 <div className="text-[13px] font-semibold text-[#FFFFFF]">{item.label}</div>
 <div className="text-[11px] text-[#8E8E93] mt-0.5">{item.desc}</div>
 </div>
 <div className={`text-[13px] font-semibold ${item.color === 'orange' ? 'text-[#34C759]' : colors.text}`}>
 {item.value}
 </div>
 </div>
 )
 })}
 </div>
 </div>

 {/* 硬件连接管理 */}
 <div className="mb-4">
 <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2 px-1">
 Hardware Connection
 </div>

 {/* 数据源状态 */}
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-3 mb-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Activity size={14} className="text-[#8E8E93]" />
 <span className="text-[12px] text-[#8E8E93]">Data Source</span>
 </div>
 <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border
 ${activeDataSource === 'bluetooth'
 ? 'bg-[rgba(1,214,190,0.12)] text-[#01D6BE] border-[rgba(1,214,190,0.3)]'
 : activeDataSource === 'serial'
 ? 'bg-[rgba(168,85,247,0.12)] text-[#A855F7] border-[rgba(168,85,247,0.3)]'
 : 'bg-[rgba(52,199,89,0.08)] text-[#34C759] border-[rgba(52,199,89,0.2)]'}`}>
 {activeDataSource === 'bluetooth' ? '● BLE Hardware'
 : activeDataSource === 'serial' ? '● Serial Hardware'
 : '◎ Simulator'}
 </span>
 </div>
 </div>

 {/* BLE 蓝牙连接 */}
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden mb-3">
 <div className="flex items-center gap-3 px-4 py-3.5">
 <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
 ${bleConnection.status === 'connected'
 ? 'bg-[rgba(1,214,190,0.15)] text-[#01D6BE]'
 : 'bg-[rgba(255,255,255,0.06)] text-[#8E8E93]'}`}>
 <Bluetooth size={16} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-[13px] font-semibold text-[#FFFFFF]">Bluetooth BLE</div>
 <div className="text-[11px] text-[#8E8E93] mt-0.5 truncate">
 {bleConnection.status === 'connected'
 ? `${bleConnection.deviceName ?? 'Device'} · ${bleConnection.rssi ? `${bleConnection.rssi} dBm` : 'Connected'}`
 : bleConnection.status === 'scanning'  ? 'Scanning for devices...'
 : bleConnection.status === 'connecting' ? 'Connecting...'
 : bleConnection.status === 'error' ? (bleConnection.errorMessage ?? 'Error')
 : bleSupported ? 'Tap to connect via BLE GATT' : 'Not supported in this browser'}
 </div>
 </div>
 <button
 onClick={handleBleToggle}
 disabled={!bleSupported || bleConnection.status === 'scanning' || bleConnection.status === 'connecting'}
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold
 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
 ${bleConnection.status === 'connected'
 ? 'bg-[rgba(255,59,48,0.12)] text-[#FF3B30] border border-[rgba(255,59,48,0.3)]'
 : 'bg-[rgba(1,214,190,0.12)] text-[#01D6BE] border border-[rgba(1,214,190,0.3)]'}`}
 >
 {(bleConnection.status === 'scanning' || bleConnection.status === 'connecting')
 ? <Loader2 size={11} className="animate-spin" />
 : bleConnection.status === 'connected'
 ? <><Link2Off size={11} /> Disconnect</>
 : <><Link2 size={11} /> Connect</>}
 </button>
 </div>
 </div>

 {/* Serial / Modbus 连接 */}
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden mb-3">
 <div className="flex items-center gap-3 px-4 py-3.5">
 <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
 ${serialConnection.status === 'connected'
 ? 'bg-[rgba(168,85,247,0.15)] text-[#A855F7]'
 : 'bg-[rgba(255,255,255,0.06)] text-[#8E8E93]'}`}>
 <Usb size={16} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-[13px] font-semibold text-[#FFFFFF]">Serial · Modbus RTU</div>
 <div className="text-[11px] text-[#8E8E93] mt-0.5 truncate">
 {serialConnection.status === 'connected'
 ? 'RS485 · 9600 bps · 8N1 · Polling 2s'
 : serialConnection.status === 'scanning' ? 'Selecting port...'
 : serialConnection.status === 'connecting' ? 'Opening port...'
 : serialConnection.status === 'error' ? (serialConnection.errorMessage ?? 'Error')
 : serialSupported ? 'Tap to connect via RS485 / USB-Serial' : 'Not supported in this browser'}
 </div>
 </div>
 <button
 onClick={handleSerialToggle}
 disabled={!serialSupported || serialConnection.status === 'scanning' || serialConnection.status === 'connecting'}
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold
 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
 ${serialConnection.status === 'connected'
 ? 'bg-[rgba(255,59,48,0.12)] text-[#FF3B30] border border-[rgba(255,59,48,0.3)]'
 : 'bg-[rgba(168,85,247,0.12)] text-[#A855F7] border border-[rgba(168,85,247,0.3)]'}`}
 >
 {(serialConnection.status === 'scanning' || serialConnection.status === 'connecting')
 ? <Loader2 size={11} className="animate-spin" />
 : serialConnection.status === 'connected'
 ? <><Link2Off size={11} /> Disconnect</>
 : <><Link2 size={11} /> Connect</>}
 </button>
 </div>
 {/* 协议信息展开条 */}
 {serialConnection.status === 'connected' && (
 <div className="px-4 pb-3 flex gap-2 flex-wrap">
 {['Modbus RTU', 'FC03/04', 'FC06/10', 'CRC-16'].map(tag => (
 <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full
 bg-[rgba(168,85,247,0.08)] text-[#A855F7] border border-[rgba(168,85,247,0.2)]">
 {tag}
 </span>
 ))}
 </div>
 )}
 </div>

 {/* 其他连接设置 */}
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
 {[
 { icon: Wifi,  label: 'Wi-Fi', desc: 'HomeNetwork · Connected', right: 'badge-connected', storeKey: null },
 { icon: Cloud, label: 'Cloud Sync', desc: 'Real-time data · Remote', right: 'toggle', storeKey: 'cloudSync' as const },
 ].map((item, i, arr) => {
 const Icon = item.icon
 return (
 <div key={item.label}
 className={`flex items-center gap-3 px-4 py-3.5
 ${i !== arr.length - 1 ? 'border-b border-[rgba(1,214,190,0.08)]' : ''}`}>
 <div className="w-9 h-9 rounded-lg bg-[rgba(1,214,190,0.1)] text-[#01D6BE]
 flex items-center justify-center flex-shrink-0">
 <Icon size={16} />
 </div>
 <div className="flex-1">
 <div className="text-[13px] font-semibold text-[#FFFFFF]">{item.label}</div>
 <div className="text-[11px] text-[#8E8E93] mt-0.5">{item.desc}</div>
 </div>
 {item.right === 'badge-connected' && (
 <span className="text-[10px] px-2 py-0.5 rounded-full
 bg-[rgba(52,199,89,0.12)] text-[#34C759] border border-[rgba(52,199,89,0.25)] font-semibold">
 Connected
 </span>
 )}
 {item.right === 'toggle' && item.storeKey && (
 <ToggleSwitch
 isOn={settings[item.storeKey] as boolean}
 onToggle={() => updateSettings({ [item.storeKey!]: !settings[item.storeKey!] })}
 size="sm"
 />
 )}
 </div>
 )
 })}
 </div>
 </div>

 {/* IndexedDB 数据库面板 */}
 <div className="mb-4">
 <button
 onClick={() => setShowDbPanel(v => !v)}
 className="w-full text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2 px-1
 flex items-center justify-between"
 >
 <span className="flex items-center gap-2">
 <Database size={12} />
 Local Database (IndexedDB)
 </span>
 <ChevronRight size={12} className={`transition-transform ${showDbPanel ? 'rotate-90' : ''}`} />
 </button>

 <AnimatePresence>
 {showDbPanel && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 className="overflow-hidden"
 >
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4 mb-3">
 <div className="grid grid-cols-2 gap-2 mb-3">
 {dbStats && Object.entries({
 'Power History': dbStats.powerHistory,
 'Alerts': dbStats.alerts,
 'Connections': dbStats.connectionLogs,
 'Commands': dbStats.commands,
 }).map(([label, count]) => (
 <div key={label} className="bg-[rgba(1,214,190,0.05)] rounded-xl p-2.5">
 <div className="text-[18px] font-bold text-[#01D6BE]">{count}</div>
 <div className="text-[10px] text-[#8E8E93] mt-0.5">{label}</div>
 </div>
 ))}
 {!dbStats && (
 <div className="col-span-2 text-[12px] text-[#8E8E93] text-center py-2">
 Loading...
 </div>
 )}
 </div>
 <div className="text-[10px] text-[#48484A] mb-3">
 Power history: 10s interval · max 8640 records (~24h)<br />
 Alerts: max 500 · Commands: max 200
 </div>
 <button
 onClick={handleClearDB}
 className="w-full py-2 rounded-xl text-[12px] font-semibold
 bg-[rgba(255,59,48,0.08)] text-[#FF3B30] border border-[rgba(255,59,48,0.2)]
 active:scale-95 transition-transform"
 >
 Clear All History
 </button>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>

 {/* 系统设置 */}
 <div className="mb-4">
 <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2 px-1">
 System
 </div>
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
 {systemItems.map((item, i) => {
 const Icon = item.icon
 const colors = colorClasses[item.color]
 return (
 <div 
 key={item.label}
 className={`flex items-center gap-3 px-4 py-3.5 
 ${i !== systemItems.length - 1 ? 'border-b border-[rgba(1,214,190,0.08)]' : ''}`}
 >
 <div className={`w-9 h-9 rounded-lg ${colors.bg} ${colors.text} 
 flex items-center justify-center flex-shrink-0`}>
 <Icon size={16} />
 </div>
 <div className="flex-1">
 <div className="text-[13px] font-semibold text-[#FFFFFF]">{item.label}</div>
 <div className="text-[11px] text-[#8E8E93] mt-0.5">{item.desc}</div>
 </div>
 <div className="flex items-center gap-2">
 {item.type === 'toggle' && item.storeKey && (
 <ToggleSwitch 
 isOn={settings[item.storeKey] as boolean}
 onToggle={() => updateSettings({ [item.storeKey!]: !settings[item.storeKey!] })}
 size="sm"
 />
 )}
 {item.type === 'nav' && (
 <>
 <ChevronRight size={16} className="text-[#48484A]" />
 </>
 )}
 {item.type === 'badge' && (
 <span className="text-[10px] px-2 py-0.5 rounded-full 
 bg-[rgba(52,199,89,0.12)] text-[#34C759] border border-[rgba(52,199,89,0.25)]
 font-semibold">
 Latest
 </span>
 )}
 {item.type === 'nav-danger' && (
 <ChevronRight size={16} className="text-[#FF3B30]" />
 )}
 </div>
 </div>
 )
 })}
 </div>
 </div>

 {/* 版本信息 */}
 <div className="text-center py-4 text-[11px] text-[#48484A] leading-relaxed">
 <div>Sierro App · v{appVersion.version} (Build {appVersion.build})</div>
 <div>© 2026 Sierro Technology Co., Ltd.</div>
 <div className="mt-2 flex justify-center gap-4">
 <button onClick={() => setShowPrivacy(true)} className="text-[#01D6BE] hover:underline">Privacy Policy</button>
 <button onClick={() => setShowTerms(true)} className="text-[#01D6BE] hover:underline">Terms of Use</button>
 <button onClick={() => setShowSupport(true)} className="text-[#01D6BE] hover:underline">Support</button>
 </div>
 </div>
 </div>
 
 {/* ==================== Privacy Policy Modal ==================== */}
 <AnimatePresence>
 {showPrivacy && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60  p-4"
 onClick={() => setShowPrivacy(false)}
 >
 <motion.div
 initial={{ y: '100%' }}
 animate={{ y: 0 }}
 exit={{ y: '100%' }}
 transition={{ type: 'spring', damping: 25, stiffness: 300 }}
 className="w-full max-w-md bg-[#1C1C1E] rounded-[28px] border border-[rgba(1,214,190,0.15)] overflow-hidden max-h-[85vh]"
 onClick={e => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(1,214,190,0.1)]">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-[rgba(1,214,190,0.1)] flex items-center justify-center">
 <Shield size={20} className="text-[#01D6BE]" />
 </div>
 <div>
 <h3 className="text-base font-bold text-[#FFFFFF]">Privacy Policy</h3>
 <p className="text-[11px] text-[#8E8E93]">Last updated: March 2026</p>
 </div>
 </div>
 <button onClick={() => setShowPrivacy(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]">
 <X size={20} className="text-[#8E8E93]" />
 </button>
 </div>
 
 {/* Content */}
 <div className="p-5 overflow-y-auto max-h-[60vh]">
 <div className="space-y-4">
 {privacyContent.map((section, i) => (
 <div key={i} className="bg-[rgba(1,214,190,0.03)] rounded-xl p-4">
 <h4 className="text-[13px] font-semibold text-[#01D6BE] mb-2">{section.title}</h4>
 <p className="text-[12px] text-[#8E8E93] leading-relaxed">{section.content}</p>
 </div>
 ))}
 </div>
 </div>
 
 {/* Footer */}
 <div className="p-4 border-t border-[rgba(1,214,190,0.1)]">
 <button
 onClick={() => setShowPrivacy(false)}
 className="w-full py-3 rounded-xl bg-[rgba(1,214,190,0.12)] text-[#01D6BE] font-semibold text-[13px] active:scale-95 transition-transform"
 >
 I Understand
 </button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 
 {/* ==================== Terms of Use Modal ==================== */}
 <AnimatePresence>
 {showTerms && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60  p-4"
 onClick={() => setShowTerms(false)}
 >
 <motion.div
 initial={{ y: '100%' }}
 animate={{ y: 0 }}
 exit={{ y: '100%' }}
 transition={{ type: 'spring', damping: 25, stiffness: 300 }}
 className="w-full max-w-md bg-[#1C1C1E] rounded-[28px] border border-[rgba(52,199,89,0.15)] overflow-hidden max-h-[85vh]"
 onClick={e => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(52,199,89,0.1)]">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-[rgba(52,199,89,0.1)] flex items-center justify-center">
 <FileText size={20} className="text-[#34C759]" />
 </div>
 <div>
 <h3 className="text-base font-bold text-[#FFFFFF]">Terms of Use</h3>
 <p className="text-[11px] text-[#8E8E93]">Version {appVersion.version}</p>
 </div>
 </div>
 <button onClick={() => setShowTerms(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]">
 <X size={20} className="text-[#8E8E93]" />
 </button>
 </div>
 
 {/* Content */}
 <div className="p-5 overflow-y-auto max-h-[60vh]">
 <div className="space-y-4">
 {termsContent.map((section, i) => (
 <div key={i} className="bg-[rgba(52,199,89,0.03)] rounded-xl p-4">
 <h4 className="text-[13px] font-semibold text-[#34C759] mb-2">{section.title}</h4>
 <p className="text-[12px] text-[#8E8E93] leading-relaxed">{section.content}</p>
 </div>
 ))}
 </div>
 </div>
 
 {/* Footer */}
 <div className="p-4 border-t border-[rgba(52,199,89,0.1)]">
 <button
 onClick={() => setShowTerms(false)}
 className="w-full py-3 rounded-xl bg-[rgba(52,199,89,0.12)] text-[#34C759] font-semibold text-[13px] active:scale-95 transition-transform"
 >
 I Agree
 </button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 
 {/* ==================== Support Modal ==================== */}
 <AnimatePresence>
 {showSupport && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60  p-4"
 onClick={() => setShowSupport(false)}
 >
 <motion.div
 initial={{ y: '100%' }}
 animate={{ y: 0 }}
 exit={{ y: '100%' }}
 transition={{ type: 'spring', damping: 25, stiffness: 300 }}
 className="w-full max-w-md bg-[#1C1C1E] rounded-[28px] border border-[rgba(255,149,0,0.15)] overflow-hidden"
 onClick={e => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,149,0,0.1)]">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-[rgba(255,149,0,0.1)] flex items-center justify-center">
 <Headphones size={20} className="text-[#FF9500]" />
 </div>
 <div>
 <h3 className="text-base font-bold text-[#FFFFFF]">Support</h3>
 <p className="text-[11px] text-[#8E8E93]">We are here to help</p>
 </div>
 </div>
 <button onClick={() => setShowSupport(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]">
 <X size={20} className="text-[#8E8E93]" />
 </button>
 </div>
 
 {/* Content */}
 <div className="p-5">
 {supportSubmitted ? (
 <motion.div
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 className="text-center py-8"
 >
 <div className="w-16 h-16 rounded-full bg-[rgba(52,199,89,0.1)] flex items-center justify-center mx-auto mb-4">
 <CheckCircle size={32} className="text-[#34C759]" />
 </div>
 <h4 className="text-[15px] font-bold text-[#FFFFFF] mb-2">Feedback Submitted!</h4>
 <p className="text-[12px] text-[#8E8E93]">We will get back to you within 24 hours.</p>
 </motion.div>
 ) : (
 <form onSubmit={handleSupportSubmit} className="space-y-4">
 {/* Email Input */}
 <div>
 <label className="text-[12px] font-semibold text-[#8E8E93] mb-2 flex items-center gap-2">
 <Mail size={14} />
 Your Email
 </label>
 <input
 type="email"
 required
 value={supportEmail}
 onChange={e => setSupportEmail(e.target.value)}
 placeholder="you@example.com"
 className="w-full px-4 py-3 rounded-xl bg-[#000000] border border-[rgba(1,214,190,0.15)]
 text-[#FFFFFF] text-[13px] placeholder:text-[#48484A]
 focus:outline-none focus:border-[rgba(1,214,190,0.4)] transition-colors"
 />
 </div>
 
 {/* Message Input */}
 <div>
 <label className="text-[12px] font-semibold text-[#8E8E93] mb-2 flex items-center gap-2">
 <FileText size={14} />
 Your Feedback
 </label>
 <textarea
 required
 value={supportMessage}
 onChange={e => setSupportMessage(e.target.value)}
 placeholder="Describe your issue or suggestion..."
 rows={4}
 className="w-full px-4 py-3 rounded-xl bg-[#000000] border border-[rgba(1,214,190,0.15)]
 text-[#FFFFFF] text-[13px] placeholder:text-[#48484A] resize-none
 focus:outline-none focus:border-[rgba(1,214,190,0.4)] transition-colors"
 />
 </div>
 
 {/* Submit Button */}
 <button
 type="submit"
 className="w-full py-3.5 rounded-xl bg-[rgba(255,149,0,0.12)] text-[#FF9500] font-semibold text-[13px]
 flex items-center justify-center gap-2 active:scale-95 transition-transform
 border border-[rgba(255,149,0,0.2)]"
 >
 <Send size={16} />
 Submit Feedback
 </button>
 
 <p className="text-[10px] text-[#48484A] text-center">
 By submitting, you agree to our Privacy Policy
 </p>
 </form>
 )}
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
  )
}
