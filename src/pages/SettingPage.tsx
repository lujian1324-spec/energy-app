import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  X,
  Send,
  Loader2,
  CheckCircle,
  Headphones,
  Crown,
  Gift,
  Sparkles,
  Tag,
  Star,
  Gem,
  LogOut,
  RotateCcw,
  Download,
} from 'lucide-react'
import emailjs from '@emailjs/browser'
import Icon from '../components/Icon'
import { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, isEmailJsConfigured } from '../config/emailjs'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useAuthStore } from '../stores/authStore'
import { deleteAccount } from '../api/authApi'
import { getUserProfile } from '../db/powerflowDB'
import appVersion from '../version.json'
import ProfileEditPage from './ProfileEditPage'
import ToggleSwitch from '../components/ToggleSwitch'
import type { UserProfile } from '../types/protocol'
import { requestNotificationPermission, getNotificationPermission, enableWebPush, disableWebPush } from '../utils/pushNotification'
import { PUSH_ENABLED } from '../config/webPush'
import { initNativePush, teardownNativePush } from '../utils/nativePush'
import { Capacitor } from '@capacitor/core'

export default function SettingPage() {
  const navigate = useNavigate()
  const { powerStation, settings, updateSettings, activateFounderBadge } = usePowerStationStore()
  const { user: authUser, logout, isGuest } = useAuthStore()
  const [showSupport, setShowSupport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showFounderModal, setShowFounderModal] = useState(false)

  // Support form
  const [supportEmail, setSupportEmail] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [supportSubmitted, setSupportSubmitted] = useState(false)

  // Founder Badge
  const [founderCode, setFounderCode] = useState('')
  const [founderMessage, setFounderMessage] = useState('')
  const [founderSuccess, setFounderSuccess] = useState(false)

  // Profile - 从 authStore 获取登录账号信息
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: authUser?.account ?? '',
    email: authUser?.account ?? '',
    avatar: null,
    memberSince: new Date().toISOString().slice(0, 10),
  })

  // Push notification settings
  const [pushOutage, setPushOutage] = useState(settings.pushNotifications)
  const [pushLowBattery, setPushLowBattery] = useState(settings.pushLowBattery ?? false)
  const [pushSolarStatus, setPushSolarStatus] = useState(settings.pushSolarStatus ?? false)
  const [lowBatteryThreshold, setLowBatteryThreshold] = useState(settings.lowBatteryThreshold ?? 30)

  // 任一推送开关变化后，编排服务端推送：
  // - 打开任一开关 → 原生:接线 APNs/FCM 并上报 token;Web:VAPID 订阅 + 上报
  // - 全部关闭     → 注销
  const syncWebPush = useCallback(async (outage: boolean, lowBat: boolean, solar: boolean) => {
    const anyOn = outage || lowBat || solar
    if (Capacitor.isNativePlatform()) {
      if (anyOn) await initNativePush()
      else await teardownNativePush()
      return
    }
    if (anyOn) {
      await enableWebPush()
    } else {
      await disableWebPush()
    }
  }, [])

  const reloadUserProfile = useCallback(() => {
    getUserProfile().then(p => { if (p) setUserProfile(p) }).catch(err => console.error('[SettingPage] getUserProfile failed:', err))
  }, [])

  useEffect(() => {
    reloadUserProfile()
  }, [reloadUserProfile])

  const [supportSending, setSupportSending] = useState(false)
  const [supportError, setSupportError] = useState('')

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSupportSending(true)
    setSupportError('')

    // Preferred path: send via EmailJS (recipient is fixed in the template).
    if (isEmailJsConfigured()) {
      try {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            from_email: supportEmail,
            message: supportMessage,
            subject: 'Sierro App Feedback',
          },
          { publicKey: EMAILJS_PUBLIC_KEY }
        )
        setSupportSubmitted(true)
        setTimeout(() => {
          setShowSupport(false)
          setSupportEmail('')
          setSupportMessage('')
          setSupportSubmitted(false)
          setSupportSending(false)
        }, 1500)
      } catch (err) {
        setSupportError(err instanceof Error ? err.message : 'Failed to send feedback. Please try again.')
        setSupportSending(false)
      }
      return
    }

    // Fallback: open the user's mail client until EmailJS is configured.
    const subject = encodeURIComponent('Sierro App Feedback')
    const body = encodeURIComponent(`From: ${supportEmail}\n\n${supportMessage}`)
    window.open(`mailto:lujian1324@gmail.com?subject=${subject}&body=${body}`, '_blank')
    setSupportSubmitted(true)
    setTimeout(() => {
      setShowSupport(false)
      setSupportEmail('')
      setSupportMessage('')
      setSupportSubmitted(false)
      setSupportSending(false)
    }, 1500)
  }

  const handleFounderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = activateFounderBadge(founderCode)
    setFounderSuccess(result.success)
    setFounderMessage(result.message)
    if (result.success) setTimeout(() => { setShowFounderModal(false); setFounderCode(''); setFounderMessage('') }, 2000)
  }

  const founderBenefits = [
    { icon: Sparkles, label: 'Early Access', desc: 'Priority access to new products' },
    { icon: Tag, label: 'Exclusive Discounts', desc: 'Special pricing on new releases' },
    { icon: Gift, label: 'Product Updates', desc: 'First to know about new features' },
    { icon: Star, label: 'VIP Support', desc: 'Priority customer service' },
  ]


  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-4 safe-area-top">
        {/* User Profile — avatar + name + manage-account row, Founding Member gold tag */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6">
          {/* Avatar: green ring (default) / gold ring (founder); default icon lightning / diamond */}
          <button
            onClick={() => isGuest ? navigate('/login') : setShowProfileEdit(true)}
            className="relative flex-shrink-0 active:scale-[0.96] transition-transform">
            <div className={`w-[52px] h-[52px] rounded-full flex items-center justify-center overflow-hidden border-m
              ${settings.founderBadge
                ? 'border-membership bg-[rgba(255,215,0,0.06)]'
                : 'border-primary bg-[rgba(1,214,190,0.06)]'}`}>
              {userProfile.avatar ? (
                <img src={userProfile.avatar} alt={userProfile.name} className="w-full h-full object-cover" />
              ) : settings.founderBadge ? (
                <Gem size={24} className="text-membership" />
              ) : (
                <Icon name="thunder" size={24} className="opacity-90" />
              )}
            </div>
          </button>
          <button
            onClick={() => isGuest ? navigate('/login') : setShowProfileEdit(true)}
            className="flex-1 min-w-0 text-left active:opacity-80 transition-opacity">
            <h3 className="text-title-lg font-semibold text-ink-1 truncate">
              {isGuest ? 'Guest User' : userProfile.name}
            </h3>
            <div className="flex items-center gap-0.5 mt-0.5 text-ink-6">
              <span className="text-body-md">{isGuest ? 'Sign in to manage your account' : 'Manage my account'}</span>
              <Icon name="chevron-right" size={14} className="opacity-60" />
            </div>
          </button>
          {/* Founding Member gold tag */}
          {settings.founderBadge && (
            <button
              onClick={() => setShowFounderModal(true)}
              className="flex-shrink-0 px-3 py-1 rounded-pill bg-[rgba(255,215,0,0.18)] border-s border-membership active:scale-[0.96] transition-transform">
              <span className="text-label font-semibold text-membership whitespace-nowrap">
                Founding Member #{settings.founderBadgeNumber}
              </span>
            </button>
          )}
        </motion.div>

        {/* Push Notifications — hidden until push backend/credentials are ready (PUSH_ENABLED) */}
        {PUSH_ENABLED && (<>
        <h3 className="text-title-md font-semibold text-ink-1 mb-3">Push Notifications</h3>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="space-y-3 mb-6">
          {/* Power Outage */}
          <div className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5 text-left">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="outage" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-lg font-semibold text-ink-1">Power Outage</div>
              <div className="text-body-md text-ink-6 mt-0.5">Get alerted during outages</div>
            </div>
            <ToggleSwitch
              isOn={pushOutage}
              onToggle={async () => {
                const next = !pushOutage
                setPushOutage(next)
                updateSettings({ pushNotifications: next })
                if (next && getNotificationPermission() !== 'granted') {
                  await requestNotificationPermission()
                }
                await syncWebPush(next, pushLowBattery, pushSolarStatus)
              }}
              ariaLabel="Toggle power outage alerts"
            />
          </div>

          {/* Low Battery */}
          <div className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5 text-left">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="low-battery" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-lg font-semibold text-ink-1">Low Battery</div>
              <div className="text-body-md text-ink-6 mt-0.5">
                {pushLowBattery ? `Get alerted when battery falls below ${lowBatteryThreshold}%` : 'Get notified when battery gets low'}
              </div>
            </div>
            <ToggleSwitch
              isOn={pushLowBattery}
              onToggle={async () => {
                const next = !pushLowBattery
                setPushLowBattery(next)
                updateSettings({ pushLowBattery: next })
                if (next && getNotificationPermission() !== 'granted') {
                  await requestNotificationPermission()
                }
                await syncWebPush(pushOutage, next, pushSolarStatus)
              }}
              ariaLabel="Toggle low battery alerts"
            />
          </div>

          {/* Low Battery Threshold Slider — shown when enabled */}
          <AnimatePresence>
            {pushLowBattery && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-ink-10 rounded-l px-4 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-label text-ink-6">Alert Threshold</span>
                    <span className="text-label font-semibold text-primary">{lowBatteryThreshold}%</span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min="10"
                      max="30"
                      step="10"
                      value={lowBatteryThreshold}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        setLowBatteryThreshold(val)
                        updateSettings({ lowBatteryThreshold: val })
                      }}
                      className="w-full h-1.5 bg-ink-9 rounded-pill appearance-none cursor-pointer accent-primary"
                      style={{
                        background: `linear-gradient(to right, #01D6BE 0%, #01D6BE ${((lowBatteryThreshold - 10) / 20) * 100}%, #454545 ${((lowBatteryThreshold - 10) / 20) * 100}%, #454545 100%)`
                      }}
                    />
                    <div className="flex justify-between px-0.5 mt-1">
                      {[10, 20, 30].map((val) => (
                        <button
                          key={val}
                          onClick={() => {
                            setLowBatteryThreshold(val)
                            updateSettings({ lowBatteryThreshold: val })
                          }}
                          className={`text-tiny transition-colors ${lowBatteryThreshold === val ? 'text-primary font-semibold' : 'text-ink-7'}`}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Solar Status */}
          <div className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5 text-left">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="solar" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-lg font-semibold text-ink-1">Solar Status</div>
              <div className="text-body-md text-ink-6 mt-0.5">Get alerted when solar connects or disconnects</div>
            </div>
            <ToggleSwitch
              isOn={pushSolarStatus}
              onToggle={async () => {
                const next = !pushSolarStatus
                setPushSolarStatus(next)
                updateSettings({ pushSolarStatus: next })
                if (next && getNotificationPermission() !== 'granted') {
                  await requestNotificationPermission()
                }
                await syncWebPush(pushOutage, pushLowBattery, next)
              }}
              ariaLabel="Toggle solar status alerts"
            />
          </div>
        </motion.div>
        </>)}

        {/* Support */}
        <h3 className="text-title-md font-semibold text-ink-1 mb-3">Support</h3>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mb-6">
          <button
            onClick={() => setShowSupport(true)}
            className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5 active:scale-[0.99] transition-transform text-left">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="feedback" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-lg font-semibold text-ink-1">Feedback</div>
              <div className="text-body-md text-ink-6 mt-0.5">Send feedback to the Sierro team</div>
            </div>
          </button>
        </motion.div>

        {/* Data Export */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="mb-6">
          <button
            onClick={() => {
              const data = { exportedAt: new Date().toISOString(), settings, powerStation }
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url
              a.download = `sierro-data-${new Date().toISOString().slice(0,10)}.json`
              a.click(); URL.revokeObjectURL(url)
            }}
            className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5 active:scale-[0.99] transition-transform text-left">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Download size={16} className="text-ink-1" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-lg font-semibold text-ink-1">Export My Data</div>
              <div className="text-body-md text-ink-6 mt-0.5">Download your settings and device data as JSON</div>
            </div>
          </button>
        </motion.div>

        {/* Legal + Version */}
        <div className="text-center py-2 leading-relaxed">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Link to="/privacy" className="text-body-md font-semibold text-primary hover:opacity-80 transition-opacity">
              Privacy Policy
            </Link>
            <span className="text-ink-7">|</span>
            <Link to="/terms" className="text-body-md font-semibold text-primary hover:opacity-80 transition-opacity">
              Terms of Use
            </Link>
          </div>
          <p className="text-caption text-ink-7">
            Sierro App v{appVersion.version} &copy; 2026 Sierro Inc.
          </p>
        </div>
      </div>

      {/* ==================== Support Modal ==================== */}
      <AnimatePresence>
        {showSupport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => setShowSupport(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-ink-10 rounded-[28px] border border-[rgba(255,149,0,0.15)] overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,149,0,0.1)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-l bg-[rgba(255,149,0,0.1)] flex items-center justify-center">
                    <Headphones size={20} className="text-warning" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink-1">Feedback</h3>
                    <p className="text-[11px] text-ink-6">We'd love to hear from you</p>
                  </div>
                </div>
                <button onClick={() => setShowSupport(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]"><X size={20} className="text-ink-6" /></button>
              </div>
              <div className="p-5">
                {supportSubmitted ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-[rgba(52,199,89,0.1)] flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} className="text-success" />
                    </div>
                    <h4 className="text-body-lg font-bold text-ink-1 mb-2">Feedback Submitted!</h4>
                    <p className="text-[12px] text-ink-6">We will get back to you within 24 hours.</p>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSupportSubmit} className="space-y-4">
                    <div>
                      <label className="text-[12px] font-semibold text-ink-6 mb-2 flex items-center gap-2"><Icon name="email" size={14} />Your Email</label>
                      <input type="email" required value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="you@example.com"
                        className="w-full px-4 py-3 rounded-l bg-ink-12 border border-[rgba(1,214,190,0.15)] text-ink-1 text-body-md placeholder:text-ink-7 focus:outline-none focus:border-[rgba(1,214,190,0.4)] transition-colors" />
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold text-ink-6 mb-2 flex items-center gap-2"><Icon name="feedback" size={14} />Your Feedback</label>
                      <textarea required value={supportMessage} onChange={e => setSupportMessage(e.target.value)} placeholder="Describe your issue or suggestion..." rows={4}
                        className="w-full px-4 py-3 rounded-l bg-ink-12 border border-[rgba(1,214,190,0.15)] text-ink-1 text-body-md placeholder:text-ink-7 resize-none focus:outline-none focus:border-[rgba(1,214,190,0.4)] transition-colors" />
                    </div>
                    {supportError && (
                      <p className="text-[12px] text-danger text-center">{supportError}</p>
                    )}
                    <button type="submit" disabled={supportSending} className="w-full py-3.5 rounded-l bg-[rgba(255,149,0,0.12)] text-warning font-semibold text-body-md flex items-center justify-center gap-2 active:scale-95 transition-transform border border-[rgba(255,149,0,0.2)] disabled:opacity-50">
                      {supportSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      {supportSending ? 'Sending...' : 'Submit Feedback'}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== Delete Account Confirm ==================== */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
            onClick={() => !deleteLoading && setShowDeleteConfirm(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-ink-10 rounded-[28px] border border-[rgba(255,59,48,0.2)] overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-5 space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-[rgba(255,59,48,0.1)] flex items-center justify-center mx-auto mb-3">
                    <Icon name="trash" size={24} />
                  </div>
                  <h3 className="text-base font-bold text-ink-1 mb-2">Delete Account</h3>
                  <p className="text-body-md text-ink-6">This will permanently delete your account and all associated data. This action cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <button disabled={deleteLoading} onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-3 rounded-l bg-[rgba(255,255,255,0.06)] text-ink-1 font-semibold text-body-md disabled:opacity-50">
                    Cancel
                  </button>
                  <button disabled={deleteLoading} onClick={async () => {
                    setDeleteLoading(true)
                    try {
                      await deleteAccount()
                    } catch { /* ignore — server may reject already-deleted accounts */ }
                    await logout()
                    setShowDeleteConfirm(false)
                    setDeleteLoading(false)
                  }}
                    className="flex-1 py-3 rounded-l bg-[rgba(255,59,48,0.15)] text-danger font-semibold text-body-md border border-[rgba(255,59,48,0.3)] flex items-center justify-center gap-2 disabled:opacity-50">
                    {deleteLoading ? <Loader2 size={16} className="animate-spin" /> : 'Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== Founder Badge Modal ==================== */}
      <AnimatePresence>
        {showFounderModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => setShowFounderModal(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-ink-10 rounded-[28px] border border-[rgba(255,215,0,0.2)] overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,215,0,0.1)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-l bg-[rgba(255,215,0,0.1)] flex items-center justify-center"><Crown size={20} className="text-membership" /></div>
                  <div>
                    <h3 className="text-base font-bold text-ink-1">Founder Badge</h3>
                    <p className="text-[11px] text-ink-6">Unlock exclusive benefits</p>
                  </div>
                </div>
                <button onClick={() => setShowFounderModal(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]"><X size={20} className="text-ink-6" /></button>
              </div>
              <div className="p-5">
                {founderSuccess ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-[rgba(255,215,0,0.15)] flex items-center justify-center mx-auto mb-4"><Crown size={32} className="text-membership" /></div>
                    <h4 className="text-body-lg font-bold text-membership mb-2">Welcome, Founding Member!</h4>
                    <p className="text-[12px] text-ink-6">Your exclusive benefits are now active.</p>
                  </motion.div>
                ) : (
                  <>
                    <div className="mb-5">
                      <p className="text-[12px] text-ink-6 mb-3">Founding Members enjoy:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {founderBenefits.map(b => { const Icon = b.icon; return (
                          <div key={b.label} className="flex items-center gap-2 bg-[rgba(255,215,0,0.05)] rounded-l p-2">
                            <Icon size={14} className="text-membership" /><span className="text-[11px] text-ink-1">{b.label}</span>
                          </div>
                        )})}
                      </div>
                    </div>
                    <form onSubmit={handleFounderSubmit} className="space-y-4">
                      <div>
                        <label className="text-[12px] font-semibold text-ink-6 mb-2 flex items-center gap-2"><Sparkles size={14} />Enter Code</label>
                        <input type="text" required value={founderCode} onChange={e => setFounderCode(e.target.value)} placeholder="e.g., FOUNDER2024"
                          className="w-full px-4 py-3 rounded-l bg-ink-12 border border-[rgba(255,215,0,0.2)] text-ink-1 text-body-md placeholder:text-ink-7 uppercase focus:outline-none focus:border-[rgba(255,215,0,0.5)] transition-colors" />
                      </div>
                      {founderMessage && <div className={`text-[11px] text-center ${founderSuccess ? 'text-success' : 'text-danger'}`}>{founderMessage}</div>}
                      <button type="submit" className="w-full py-3.5 rounded-l bg-[rgba(255,215,0,0.12)] text-membership font-semibold text-body-md flex items-center justify-center gap-2 active:scale-95 transition-transform border border-[rgba(255,215,0,0.25)]">
                        <Crown size={16} />Activate Badge
                      </button>
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
        {showProfileEdit && <ProfileEditPage onBack={() => { setShowProfileEdit(false); reloadUserProfile() }} />}
      </AnimatePresence>
    </div>
  )
}
