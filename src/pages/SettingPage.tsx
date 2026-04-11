import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { 
  Battery, 
  Zap, 
  Thermometer, 
  RefreshCw,
  Bell,
  Moon,
  Globe,
  Download,
  AlertTriangle,
  ChevronRight,
  BatteryCharging,
  Link2,
  Link2Off,
  Loader2,
  Signal,
  Database,
  X,
  Send,
  CheckCircle,
  Shield,
  FileText,
  Headphones,
  Mail,
  Crown,
  Gift,
  Sparkles,
  Tag,
  Star,
  User,
  Edit3,
} from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useProtocol } from '../hooks/useProtocol'
import { getDBStats, clearAllHistory, getUserProfile } from '../db/powerflowDB'
import { requestNotificationPermission, getNotificationPermission } from '../utils/pushNotification'
import appVersion from '../version.json'
import ProfileEditPage from './ProfileEditPage'
import type { UserProfile } from '../types/protocol'

export default function SettingPage() {
  const { powerStation, settings, updateSettings, activateFounderBadge } = usePowerStationStore()
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

  // Founder Badge 兑换
  const [showFounderModal, setShowFounderModal] = useState(false)
  const [founderCode, setFounderCode] = useState('')
  const [founderMessage, setFounderMessage] = useState('')
  const [founderSuccess, setFounderSuccess] = useState(false)

  // 个人信息编辑页面
  const [showProfileEdit, setShowProfileEdit] = useState(false)

  // 用户个人信息
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Alex Chen',
    email: 'alex.chen@example.com',
    phone: '+1 234 567 8900',
    avatar: null,
    memberSince: '2024-03-15',
  })

  // 加载用户资料
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const savedProfile = await getUserProfile()
        if (savedProfile) {
          setUserProfile(savedProfile)
        }
      } catch (error) {
        console.error('Failed to load user profile:', error)
      }
    }
    loadProfile()
  }, [])

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

  // 处理推送通知开关
  const handlePushNotificationToggle = async () => {
    const newValue = !settings.pushNotifications
    
    if (newValue) {
      // 开启时请求权限
      const permission = await requestNotificationPermission()
      if (permission === 'granted') {
        updateSettings({ pushNotifications: true })
      }
    } else {
      // 关闭时直接更新设置
      updateSettings({ pushNotifications: false })
    }
  }

  // 处理 Founder Badge 兑换
  const handleFounderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = activateFounderBadge(founderCode)
    setFounderSuccess(result.success)
    setFounderMessage(result.message)
    
    if (result.success) {
      setTimeout(() => {
        setShowFounderModal(false)
        setFounderCode('')
        setFounderMessage('')
      }, 2000)
    }
  }



  const systemItems = [
    { icon: Bell, label: 'Push Notifications', desc: 'Power outage alerts via system notification', type: 'toggle' as const, storeKey: 'pushNotifications' as const },
    { icon: Moon, label: 'Do Not Disturb', desc: `${settings.doNotDisturbStart} — ${settings.doNotDisturbEnd}`, type: 'toggle' as const, storeKey: 'doNotDisturb' as const },
    { icon: Globe, label: 'Language / Units', desc: 'English · Metric', type: 'nav' as const, storeKey: null },
    { icon: Download, label: 'Firmware Update', desc: `App v${appVersion.version} (Build ${appVersion.build}) · Up to date`, type: 'badge' as const, storeKey: null },
    { icon: AlertTriangle, label: 'Factory Reset', desc: 'Clear all data and settings', type: 'nav-danger' as const, storeKey: null },
  ]

  // Founder Badge 权益列表
  const founderBenefits = [
    { icon: Sparkles, label: 'Early Access', desc: 'Priority access to new products' },
    { icon: Tag, label: 'Exclusive Discounts', desc: 'Special pricing on new releases' },
    { icon: Gift, label: 'Product Updates', desc: 'First to know about new features' },
    { icon: Star, label: 'VIP Support', desc: 'Priority customer service' },
  ]

  // System 图标统一使用白色
  const systemIconClass = { bg: 'bg-[rgba(255,255,255,0.08)]', text: 'text-[#FFFFFF]' }
  
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
        <h2 className="text-xl font-bold text-[#FFFFFF]">Setting</h2>
        <p className="text-xs text-[#8E8E93] mt-1">Manage Connections & System Config</p>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {/* 用户个人信息卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setShowProfileEdit(true)}
          className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.2)] rounded-[28px] p-4 mb-4
            flex items-center gap-4 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-[#2C2C2E]" />
          
          {/* 头像区域 - 有Founder Badge时显示金边 */}
          <div className={`relative flex-shrink-0 ${settings.founderBadge ? 'p-[2px]' : ''}`}>
            {settings.founderBadge && (
              <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FFD700]" />
            )}
            <div className={`relative w-[60px] h-[60px] rounded-[20px] 
              ${settings.founderBadge ? 'bg-[#1C1C1E]' : 'bg-[rgba(1,214,190,0.08)] border border-[rgba(1,214,190,0.3)]'}
              flex items-center justify-center overflow-hidden`}>
              {userProfile.avatar ? (
                <img src={userProfile.avatar} alt={userProfile.name} className="w-full h-full object-cover" />
              ) : (
                <User size={28} className={settings.founderBadge ? 'text-[#FFD700]' : 'text-[#01D6BE]'} />
              )}
            </div>
            {settings.founderBadge && (
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#1C1C1E] border-2 border-[#FFD700] flex items-center justify-center z-10">
                <Crown size={12} className="text-[#FFD700]" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#FFFFFF] truncate">{userProfile.name}</h3>
              {settings.founderBadge && (
                <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full 
                  bg-[rgba(255,215,0,0.15)] text-[#FFD700] border border-[rgba(255,215,0,0.3)]
                  font-semibold flex-shrink-0">
                  <Crown size={10} />
                  Founding
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-0.5 truncate">{userProfile.email}</p>
            <p className="text-[10px] text-[#48484A] mt-0.5">
              Member since {new Date(userProfile.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          </div>
          
          <div className="flex-shrink-0 p-2 rounded-xl bg-[rgba(255,255,255,0.05)]">
            <Edit3 size={16} className="text-[#8E8E93]" />
          </div>
        </motion.div>

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

        {/* Founder Badge 区域 */}
        <div className="mb-4">
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2 px-1">
            Membership
          </div>
          {settings.founderBadge ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1C1C1E] border border-[rgba(255,215,0,0.2)] rounded-[20px] p-4"
            >
              {/* Founder Badge 头部 */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[rgba(255,215,0,0.1)]">
                <div className="w-12 h-12 rounded-xl bg-[rgba(255,215,0,0.15)] flex items-center justify-center">
                  <Crown size={24} className="text-[#FFD700]" />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-[#FFD700]">Founding Member</div>
                  <div className="text-[11px] text-[#8E8E93]">
                    Activated {settings.founderBadgeActivatedAt ? new Date(settings.founderBadgeActivatedAt).toLocaleDateString() : 'Recently'}
                  </div>
                </div>
              </div>
              
              {/* 权益列表 */}
              <div className="grid grid-cols-2 gap-3">
                {founderBenefits.map((benefit) => {
                  const Icon = benefit.icon
                  return (
                    <div key={benefit.label} className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[rgba(255,215,0,0.08)] flex items-center justify-center flex-shrink-0">
                        <Icon size={14} className="text-[#FFD700]" />
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-[#FFFFFF]">{benefit.label}</div>
                        <div className="text-[9px] text-[#8E8E93] leading-tight">{benefit.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          ) : (
            <div 
              onClick={() => setShowFounderModal(true)}
              className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4 flex items-center gap-3 cursor-pointer active:scale-98 transition-transform"
            >
              <div className="w-10 h-10 rounded-xl bg-[rgba(255,215,0,0.08)] flex items-center justify-center">
                <Crown size={20} className="text-[#FFD700]" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Founder Badge</div>
                <div className="text-[11px] text-[#8E8E93]">Enter code to unlock exclusive benefits</div>
              </div>
              <ChevronRight size={16} className="text-[#48484A]" />
            </div>
          )}
        </div>

        {/* 系统设置 */}
        <div className="mb-4">
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2 px-1">
            System
          </div>
          <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden">
            {systemItems.map((item, i) => {
              const Icon = item.icon
              return (
                <div 
                  key={item.label}
                  className={`flex items-center gap-3 px-4 py-3.5 
                    ${i !== systemItems.length - 1 ? 'border-b border-[rgba(1,214,190,0.08)]' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-lg ${systemIconClass.bg} ${systemIconClass.text} 
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
                        onToggle={() => {
                          if (item.storeKey === 'pushNotifications') {
                            handlePushNotificationToggle()
                          } else {
                            updateSettings({ [item.storeKey!]: !settings[item.storeKey!] })
                          }
                        }}
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

      {/* ==================== Founder Badge Modal ==================== */}
      <AnimatePresence>
        {showFounderModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => setShowFounderModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-[#1C1C1E] rounded-[28px] border border-[rgba(255,215,0,0.2)] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,215,0,0.1)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(255,215,0,0.1)] flex items-center justify-center">
                    <Crown size={20} className="text-[#FFD700]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF]">Founder Badge</h3>
                    <p className="text-[11px] text-[#8E8E93]">Unlock exclusive benefits</p>
                  </div>
                </div>
                <button onClick={() => setShowFounderModal(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]">
                  <X size={20} className="text-[#8E8E93]" />
                </button>
              </div>
              
              {/* Content */}
              <div className="p-5">
                {founderSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-8"
                  >
                    <div className="w-16 h-16 rounded-full bg-[rgba(255,215,0,0.15)] flex items-center justify-center mx-auto mb-4">
                      <Crown size={32} className="text-[#FFD700]" />
                    </div>
                    <h4 className="text-[15px] font-bold text-[#FFD700] mb-2">Welcome, Founding Member!</h4>
                    <p className="text-[12px] text-[#8E8E93]">Your exclusive benefits are now active.</p>
                  </motion.div>
                ) : (
                  <>
                    {/* 权益预览 */}
                    <div className="mb-5">
                      <p className="text-[12px] text-[#8E8E93] mb-3">Founding Members enjoy:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {founderBenefits.map((benefit) => {
                          const Icon = benefit.icon
                          return (
                            <div key={benefit.label} className="flex items-center gap-2 bg-[rgba(255,215,0,0.05)] rounded-lg p-2">
                              <Icon size={14} className="text-[#FFD700]" />
                              <span className="text-[11px] text-[#FFFFFF]">{benefit.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    
                    <form onSubmit={handleFounderSubmit} className="space-y-4">
                      {/* Code Input */}
                      <div>
                        <label className="text-[12px] font-semibold text-[#8E8E93] mb-2 flex items-center gap-2">
                          <Sparkles size={14} />
                          Enter Code
                        </label>
                        <input
                          type="text"
                          required
                          value={founderCode}
                          onChange={e => setFounderCode(e.target.value)}
                          placeholder="e.g., FOUNDER2024"
                          className="w-full px-4 py-3 rounded-xl bg-[#000000] border border-[rgba(255,215,0,0.2)]
                            text-[#FFFFFF] text-[13px] placeholder:text-[#48484A] uppercase
                            focus:outline-none focus:border-[rgba(255,215,0,0.5)] transition-colors"
                        />
                      </div>
                      
                      {founderMessage && (
                        <div className={`text-[11px] text-center ${founderSuccess ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                          {founderMessage}
                        </div>
                      )}
                      
                      {/* Submit Button */}
                      <button
                        type="submit"
                        className="w-full py-3.5 rounded-xl bg-[rgba(255,215,0,0.12)] text-[#FFD700] font-semibold text-[13px]
                          flex items-center justify-center gap-2 active:scale-95 transition-transform
                          border border-[rgba(255,215,0,0.25)]"
                      >
                        <Crown size={16} />
                        Activate Badge
                      </button>
                      
                      <p className="text-[10px] text-[#48484A] text-center">
                        Valid codes: FOUNDER2024, SIERROVIP, EARLYBIRD, POWERFLOW
                      </p>
                    </form>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== Profile Edit Page ==================== */}
      <AnimatePresence>
        {showProfileEdit && (
          <ProfileEditPage onBack={() => setShowProfileEdit(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
