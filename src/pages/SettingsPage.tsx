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
} from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useProtocol } from '../hooks/useProtocol'
import { getDBStats, clearAllHistory } from '../db/powerflowDB'

export default function SettingsPage() {
  const { powerStation, settings, updateSettings } = usePowerStationStore()
  const { bleConnection, serialConnection, activeDataSource, bleSupported, serialSupported } = useConnectionStore()
  const { connectBle, disconnectBle, connectSerial, disconnectSerial } = useProtocol()
  const [dbStats, setDbStats] = useState<Record<string, number> | null>(null)
  const [showDbPanel, setShowDbPanel] = useState(false)

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

  const deviceInfo = [
    { icon: Battery, label: 'Battery Capacity', value: '1000Wh', desc: 'LiFePO₄ · LFP Cells', color: 'blue' },
    { icon: Zap, label: 'Max Charge Power', value: '500W', desc: 'AC + Solar Simultaneous', color: 'green' },
    { icon: Thermometer, label: 'Current Temp', value: `${powerStation.temperature}°C`, desc: 'Ambient: 26°C', color: 'orange' },
    { icon: RefreshCw, label: 'Charge Cycles', value: `${powerStation.cycleCount}`, desc: '~2,714 cycles remaining', color: 'purple' },
  ]

  const systemItems = [
    { icon: Bell, label: 'Push Notifications', desc: 'Low Battery, Full, Alert', type: 'toggle' as const, color: 'orange', storeKey: 'notifications' as const },
    { icon: Moon, label: 'Do Not Disturb', desc: `${settings.doNotDisturbStart} — ${settings.doNotDisturbEnd}`, type: 'toggle' as const, color: 'gray', storeKey: 'doNotDisturb' as const },
    { icon: Globe, label: 'Language / Units', desc: 'English · Metric', type: 'nav' as const, color: 'gray', storeKey: null },
    { icon: Download, label: 'Firmware Update', desc: 'Latest: v2.4.1 · Up to date', type: 'badge' as const, color: 'green', storeKey: null },
    { icon: AlertTriangle, label: 'Factory Reset', desc: 'Clear all data and settings', type: 'nav-danger' as const, color: 'red', storeKey: null },
  ]

  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-[rgba(0,212,255,0.1)]', text: 'text-[#00D4FF]' },
    green: { bg: 'bg-[rgba(0,255,156,0.1)]', text: 'text-[#00FF9C]' },
    orange: { bg: 'bg-[rgba(255,184,0,0.1)]', text: 'text-[#FFB800]' },
    purple: { bg: 'bg-[rgba(168,85,247,0.1)]', text: 'text-[#A855F7]' },
    red: { bg: 'bg-[rgba(255,71,87,0.1)]', text: 'text-[#FF4757]' },
    gray: { bg: 'bg-[rgba(255,255,255,0.06)]', text: 'text-[#7A9AB8]' },
  }

  return (
    <div className="h-full flex flex-col bg-[#080E1A] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top">
        <h2 className="text-xl font-bold text-[#E8F4FF]">Device & Settings</h2>
        <p className="text-xs text-[#7A9AB8] mt-1">Manage Connections & System Config</p>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {/* 设备卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[rgba(0,212,255,0.08)] to-[rgba(0,255,156,0.04)]
                     border border-[rgba(0,212,255,0.2)] rounded-[28px] p-4 mb-4
                     flex items-center gap-4 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px 
                        bg-gradient-to-r from-transparent via-[rgba(0,212,255,0.5)] to-transparent" />
          
          <div className="w-[60px] h-[60px] rounded-[20px] 
                        bg-gradient-to-br from-[rgba(0,212,255,0.15)] to-[rgba(0,255,156,0.1)]
                        border border-[rgba(0,212,255,0.3)]
                        flex items-center justify-center shadow-[0_0_20px_rgba(0,212,255,0.15)]
                        flex-shrink-0">
            <BatteryCharging size={28} className="text-[#00D4FF]" />
          </div>
          
          <div className="flex-1">
            <h3 className="text-base font-bold text-[#E8F4FF]">{powerStation.name}</h3>
            <p className="text-[11px] text-[#7A9AB8] mt-0.5">Model · {powerStation.model} · S/N:{powerStation.serialNumber.slice(-5)}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full 
                             bg-[rgba(0,212,255,0.1)] text-[#00D4FF] border border-[rgba(0,212,255,0.2)]
                             font-semibold">
                FW v2.4.1
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full 
                             bg-[rgba(0,212,255,0.1)] text-[#00D4FF] border border-[rgba(0,212,255,0.2)]
                             font-semibold">
                BT 5.0
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full 
                             bg-[rgba(0,212,255,0.1)] text-[#00D4FF] border border-[rgba(0,212,255,0.2)]
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
                  className="w-1 rounded-sm bg-[#00FF9C] shadow-[0_0_4px_rgba(0,255,156,0.4)]"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <div className="text-[9px] text-[#00FF9C] font-semibold">STRONG</div>
          </div>
        </motion.div>

        {/* 设备信息 */}
        <div className="mb-4">
          <div className="text-[11px] font-bold text-[#7A9AB8] tracking-widest uppercase mb-2 px-1">
            Device Info
          </div>
          <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] overflow-hidden">
            {deviceInfo.map((item, i) => {
              const Icon = item.icon
              const colors = colorClasses[item.color]
              return (
                <div 
                  key={item.label}
                  className={`flex items-center gap-3 px-4 py-3.5 
                            ${i !== deviceInfo.length - 1 ? 'border-b border-[rgba(0,212,255,0.08)]' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-lg ${colors.bg} ${colors.text} 
                                 flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#E8F4FF]">{item.label}</div>
                    <div className="text-[11px] text-[#7A9AB8] mt-0.5">{item.desc}</div>
                  </div>
                  <div className={`text-[13px] font-semibold ${item.color === 'orange' ? 'text-[#00FF9C]' : colors.text}`}>
                    {item.value}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 硬件连接管理 */}
        <div className="mb-4">
          <div className="text-[11px] font-bold text-[#7A9AB8] tracking-widest uppercase mb-2 px-1">
            Hardware Connection
          </div>

          {/* 数据源状态 */}
          <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] p-3 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-[#7A9AB8]" />
                <span className="text-[12px] text-[#7A9AB8]">Data Source</span>
              </div>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border
                ${activeDataSource === 'bluetooth'
                  ? 'bg-[rgba(0,212,255,0.12)] text-[#00D4FF] border-[rgba(0,212,255,0.3)]'
                  : activeDataSource === 'serial'
                  ? 'bg-[rgba(168,85,247,0.12)] text-[#A855F7] border-[rgba(168,85,247,0.3)]'
                  : 'bg-[rgba(0,255,156,0.08)] text-[#00FF9C] border-[rgba(0,255,156,0.2)]'}`}>
                {activeDataSource === 'bluetooth' ? '● BLE Hardware'
                  : activeDataSource === 'serial' ? '● Serial Hardware'
                  : '◎ Simulator'}
              </span>
            </div>
          </div>

          {/* BLE 蓝牙连接 */}
          <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] overflow-hidden mb-3">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                ${bleConnection.status === 'connected'
                  ? 'bg-[rgba(0,212,255,0.15)] text-[#00D4FF]'
                  : 'bg-[rgba(255,255,255,0.06)] text-[#7A9AB8]'}`}>
                <Bluetooth size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#E8F4FF]">Bluetooth BLE</div>
                <div className="text-[11px] text-[#7A9AB8] mt-0.5 truncate">
                  {bleConnection.status === 'connected'
                    ? `${bleConnection.deviceName ?? 'Device'} · ${bleConnection.rssi ? `${bleConnection.rssi} dBm` : 'Connected'}`
                    : bleConnection.status === 'scanning'  ? 'Scanning for devices...'
                    : bleConnection.status === 'connecting' ? 'Connecting...'
                    : bleConnection.status === 'error'     ? (bleConnection.errorMessage ?? 'Error')
                    : bleSupported ? 'Tap to connect via BLE GATT' : 'Not supported in this browser'}
                </div>
              </div>
              <button
                onClick={handleBleToggle}
                disabled={!bleSupported || bleConnection.status === 'scanning' || bleConnection.status === 'connecting'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold
                           transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
                  ${bleConnection.status === 'connected'
                    ? 'bg-[rgba(255,71,87,0.12)] text-[#FF4757] border border-[rgba(255,71,87,0.3)]'
                    : 'bg-[rgba(0,212,255,0.12)] text-[#00D4FF] border border-[rgba(0,212,255,0.3)]'}`}
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
          <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] overflow-hidden mb-3">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                ${serialConnection.status === 'connected'
                  ? 'bg-[rgba(168,85,247,0.15)] text-[#A855F7]'
                  : 'bg-[rgba(255,255,255,0.06)] text-[#7A9AB8]'}`}>
                <Usb size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#E8F4FF]">Serial · Modbus RTU</div>
                <div className="text-[11px] text-[#7A9AB8] mt-0.5 truncate">
                  {serialConnection.status === 'connected'
                    ? 'RS485 · 9600 bps · 8N1 · Polling 2s'
                    : serialConnection.status === 'scanning'   ? 'Selecting port...'
                    : serialConnection.status === 'connecting' ? 'Opening port...'
                    : serialConnection.status === 'error'      ? (serialConnection.errorMessage ?? 'Error')
                    : serialSupported ? 'Tap to connect via RS485 / USB-Serial' : 'Not supported in this browser'}
                </div>
              </div>
              <button
                onClick={handleSerialToggle}
                disabled={!serialSupported || serialConnection.status === 'scanning' || serialConnection.status === 'connecting'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold
                           transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
                  ${serialConnection.status === 'connected'
                    ? 'bg-[rgba(255,71,87,0.12)] text-[#FF4757] border border-[rgba(255,71,87,0.3)]'
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
          <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] overflow-hidden">
            {[
              { icon: Wifi,  label: 'Wi-Fi',       desc: 'HomeNetwork · Connected', right: 'badge-connected', storeKey: null },
              { icon: Cloud, label: 'Cloud Sync',   desc: 'Real-time data · Remote', right: 'toggle', storeKey: 'cloudSync' as const },
            ].map((item, i, arr) => {
              const Icon = item.icon
              return (
                <div key={item.label}
                  className={`flex items-center gap-3 px-4 py-3.5
                    ${i !== arr.length - 1 ? 'border-b border-[rgba(0,212,255,0.08)]' : ''}`}>
                  <div className="w-9 h-9 rounded-lg bg-[rgba(0,212,255,0.1)] text-[#00D4FF]
                                  flex items-center justify-center flex-shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#E8F4FF]">{item.label}</div>
                    <div className="text-[11px] text-[#7A9AB8] mt-0.5">{item.desc}</div>
                  </div>
                  {item.right === 'badge-connected' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full
                      bg-[rgba(0,255,156,0.12)] text-[#00FF9C] border border-[rgba(0,255,156,0.25)] font-semibold">
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
            className="w-full text-[11px] font-bold text-[#7A9AB8] tracking-widest uppercase mb-2 px-1
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
                <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] p-4 mb-3">
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {dbStats && Object.entries({
                      'Power History': dbStats.powerHistory,
                      'Alerts':        dbStats.alerts,
                      'Connections':   dbStats.connectionLogs,
                      'Commands':      dbStats.commands,
                    }).map(([label, count]) => (
                      <div key={label} className="bg-[rgba(0,212,255,0.05)] rounded-xl p-2.5">
                        <div className="text-[18px] font-bold text-[#00D4FF]">{count}</div>
                        <div className="text-[10px] text-[#7A9AB8] mt-0.5">{label}</div>
                      </div>
                    ))}
                    {!dbStats && (
                      <div className="col-span-2 text-[12px] text-[#7A9AB8] text-center py-2">
                        Loading...
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-[#3D5A78] mb-3">
                    Power history: 10s interval · max 8640 records (~24h)<br />
                    Alerts: max 500 · Commands: max 200
                  </div>
                  <button
                    onClick={handleClearDB}
                    className="w-full py-2 rounded-xl text-[12px] font-semibold
                               bg-[rgba(255,71,87,0.08)] text-[#FF4757] border border-[rgba(255,71,87,0.2)]
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
          <div className="text-[11px] font-bold text-[#7A9AB8] tracking-widest uppercase mb-2 px-1">
            System
          </div>
          <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] overflow-hidden">
            {systemItems.map((item, i) => {
              const Icon = item.icon
              const colors = colorClasses[item.color]
              return (
                <div 
                  key={item.label}
                  className={`flex items-center gap-3 px-4 py-3.5 
                            ${i !== systemItems.length - 1 ? 'border-b border-[rgba(0,212,255,0.08)]' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-lg ${colors.bg} ${colors.text} 
                                 flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#E8F4FF]">{item.label}</div>
                    <div className="text-[11px] text-[#7A9AB8] mt-0.5">{item.desc}</div>
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
                        <ChevronRight size={16} className="text-[#3D5A78]" />
                      </>
                    )}
                    {item.type === 'badge' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full 
                                     bg-[rgba(0,255,156,0.12)] text-[#00FF9C] border border-[rgba(0,255,156,0.25)]
                                     font-semibold">
                        Latest
                      </span>
                    )}
                    {item.type === 'nav-danger' && (
                      <ChevronRight size={16} className="text-[#FF4757]" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 版本信息 */}
        <div className="text-center py-4 text-[11px] text-[#3D5A78] leading-relaxed">
          <div>Sierro App · v3.2.1 (Build 2411)</div>
          <div>© 2026 Sierro Technology Co., Ltd.</div>
          <div className="mt-2 flex justify-center gap-4">
            <span className="text-[#00D4FF] cursor-pointer hover:underline">Privacy Policy</span>
            <span className="text-[#00D4FF] cursor-pointer hover:underline">Terms of Use</span>
            <span className="text-[#00D4FF] cursor-pointer hover:underline">Support</span>
          </div>
        </div>
      </div>
    </div>
  )
}
