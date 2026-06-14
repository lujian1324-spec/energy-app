import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  X,
  Send,
  CheckCircle,
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
  ChevronRight,
  LogOut,
  Trash2,
  RotateCcw,
  Link2,
  Link2Off,
  Database,
  Shield,
} from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useAuthStore } from '../stores/authStore'
import { getUserProfile } from '../db/powerflowDB'
import appVersion from '../version.json'
import ProfileEditPage from './ProfileEditPage'
import type { UserProfile } from '../types/protocol'

export default function SettingPage() {
  const navigate = useNavigate()
  const { powerStation, settings, updateSettings, resetAll, activateFounderBadge } = usePowerStationStore()
  const { user: authUser, logout, isGuest } = useAuthStore()
  const [showSupport, setShowSupport] = useState(false)
  const [showManageAccount, setShowManageAccount] = useState(false)
  const [showFounderModal, setShowFounderModal] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

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

  // Push notification settings — 状态在 NotificationsPage 中维护，SettingPage 仅展示摘要
  const pushOutage = settings.pushNotifications
  const pushLowBattery = settings.pushNotifications
  const pushSolarStatus = settings.pushSolarStatus ?? false
  const lowBatteryThreshold = settings.lowBatteryThreshold ?? 30

  useEffect(() => {
    getUserProfile().then(p => { if (p) setUserProfile(p) }).catch(err => console.error('[SettingPage] getUserProfile failed:', err))
  }, [])

  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSupportSubmitted(true)
    setTimeout(() => { setShowSupport(false); setSupportEmail(''); setSupportMessage(''); setSupportSubmitted(false) }, 1500)
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
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top">
        <h2 className="text-xl font-bold text-[#FFFFFF]">Setting</h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {/* User Profile Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => isGuest ? navigate('/login') : setShowManageAccount(true)}
          className="bg-[#262626] border border-[rgba(1,214,190,0.2)] rounded-[28px] p-4 mb-4
            flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform">
          <div className="relative flex-shrink-0">
            {settings.founderBadge && (
              <div className="absolute -inset-[2px] rounded-[22px] bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FFD700]" />
            )}
            <div className={`relative w-[60px] h-[60px] rounded-[20px]
              ${settings.founderBadge ? 'bg-[#262626]' : 'bg-[rgba(1,214,190,0.08)] border border-[rgba(1,214,190,0.3)]'}
              flex items-center justify-center overflow-hidden`}>
              {userProfile.avatar ? (
                <img src={userProfile.avatar} alt={userProfile.name} className="w-full h-full object-cover" />
              ) : (
                <User size={28} className={settings.founderBadge ? 'text-[#FFD700]' : 'text-[#01D6BE]'} />
              )}
            </div>
            {settings.founderBadge && (
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#262626] border-2 border-[#FFD700] flex items-center justify-center z-10">
                <Crown size={12} className="text-[#FFD700]" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#FFFFFF] truncate">
                {isGuest ? 'Guest User' : userProfile.name}
              </h3>
              {settings.founderBadge && (
                <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-[rgba(255,215,0,0.15)] text-[#FFD700] border border-[rgba(255,215,0,0.3)] font-semibold flex-shrink-0">
                  <Crown size={10} /> Founding Member
                </span>
              )}
            </div>
            <p className="text-label text-[#01D6BE] mt-0.5">{isGuest ? 'Sign in to manage your account' : 'Manage my account'}</p>
          </div>
          <div className="flex-shrink-0">
            <ChevronRight size={18} className="text-[#636366]" />
          </div>
        </motion.div>

        {/* Push Notifications - PRD v1.1 §4.5.4: 跳转子页 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden mb-4">
          <div
            onClick={() => navigate('/notifications')}
            className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-[rgba(255,255,255,0.02)]"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/notifications') }}
            aria-label="Open push notifications settings"
          >
            <div className="w-9 h-9 rounded-lg bg-[rgba(255,59,48,0.08)] flex items-center justify-center flex-shrink-0">
              <Bell size={16} className="text-[#FF3B30]" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-[#FFFFFF]">Push Notifications</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">
                {[
                  pushOutage && 'Outage',
                  pushLowBattery && `Low Bat<${lowBatteryThreshold}%`,
                  pushSolarStatus && 'Solar',
                ].filter(Boolean).join(' · ') || 'All off'}
              </div>
            </div>
            <ChevronRight size={16} className="text-[#636366]" />
          </div>
        </motion.div>

        {/* Data & Privacy - PRD v1.1 §8.3: 跳转子页 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
          className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden mb-4">
          <div
            onClick={() => navigate('/data-export')}
            className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-[rgba(255,255,255,0.02)]"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/data-export') }}
            aria-label="Open data export and privacy settings"
          >
            <div className="w-9 h-9 rounded-lg bg-[rgba(52,199,89,0.08)] flex items-center justify-center flex-shrink-0">
              <Database size={16} className="text-[#34C759]" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-[#FFFFFF]">Data &amp; Privacy</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">Export your data, manage recycle bin</div>
            </div>
            <ChevronRight size={16} className="text-[#636366]" />
          </div>
        </motion.div>

        {/* Founder Badge */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className={`bg-[#262626] border rounded-[20px] overflow-hidden mb-4 cursor-pointer active:scale-[0.98] transition-transform`}
          style={{ borderColor: settings.founderBadge ? 'rgba(255,215,0,0.25)' : 'rgba(1,214,190,0.08)' }}
          onClick={() => setShowFounderModal(true)}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${settings.founderBadge ? 'bg-[rgba(255,215,0,0.12)]' : 'bg-[rgba(255,255,255,0.06)]'}`}>
              <Crown size={16} className={settings.founderBadge ? 'text-[#FFD700]' : 'text-[#FFFFFF]'} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[#FFFFFF]">Founder Badge</span>
                {settings.founderBadge && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-[rgba(255,215,0,0.15)] text-[#FFD700] border border-[rgba(255,215,0,0.3)] font-semibold">Active</span>
                )}
              </div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">
                {settings.founderBadge ? `Member #${settings.founderBadgeNumber}` : 'Unlock exclusive benefits'}
              </div>
            </div>
            <ChevronRight size={16} className={settings.founderBadge ? 'text-[#FFD700]' : 'text-[#636366]'} />
          </div>
        </motion.div>

        {/* Support */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-[rgba(1,214,190,0.06)]">
            <span className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">Support</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-[rgba(255,255,255,0.02)]"
            onClick={() => setShowSupport(true)}>
            <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
              <Headphones size={16} className="text-[#FFFFFF]" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-[#FFFFFF]">Feedback</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">Send feedback to the Sierro team</div>
            </div>
            <ChevronRight size={16} className="text-[#636366]" />
          </div>
        </motion.div>

        {/* Version Info + Legal */}
        <div className="text-center py-4 text-caption leading-relaxed">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Link
              to="/privacy"
              className="text-[#A0A0A5] hover:text-[#FFFFFF] transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-[#636366]">|</span>
            <Link
              to="/terms"
              className="text-[#A0A0A5] hover:text-[#FFFFFF] transition-colors"
            >
              Terms of Use
            </Link>
          </div>
          <div className="text-[#636366]">
            Sierro App v{appVersion.version} &copy; 2026 Sierro Inc.
          </div>
        </div>
      </div>

      {/* ==================== Manage Account Page ==================== */}
      <AnimatePresence>
        {showManageAccount && (
          <motion.div initial={{ opacity: 0, x: '100%' }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-[#141414] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-3 safe-area-top">
              <button onClick={() => setShowManageAccount(false)} className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF]">
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold text-[#FFFFFF]">Manage Account</h2>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
              {/* Personal Info */}
              <div className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden mb-4">
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(1,214,190,0.06)] cursor-pointer"
                  onClick={() => { setShowManageAccount(false); setShowProfileEdit(true) }}>
                  <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <User size={16} className="text-[#FFFFFF]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#FFFFFF]">Personal Info</div>
                    <div className="text-caption text-[#A0A0A5] mt-0.5">{userProfile.name}</div>
                  </div>
                  <ChevronRight size={16} className="text-[#636366]" />
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(1,214,190,0.06)]">
                  <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <Mail size={16} className="text-[#FFFFFF]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#FFFFFF]">Account</div>
                    <div className="text-caption text-[#A0A0A5] mt-0.5">{authUser?.account || userProfile.email}</div>
                  </div>
                </div>
                <div className="px-4 py-3 border-b border-[rgba(1,214,190,0.06)]">
                  <span className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">Link Accounts</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(1,214,190,0.06)]">
                  <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#A0A0A5"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09z"/></svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#FFFFFF]">Apple</div>
                  </div>
                  <span className="text-label text-[#FF3B30]">Unlink</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#A0A0A5"/></svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#FFFFFF]">Google</div>
                  </div>
                  <span className="text-label text-[#01D6BE]">Link</span>
                </div>
              </div>

              {/* Actions */}
              <div className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden mb-4">
                {isGuest ? (
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(1,214,190,0.06)] cursor-pointer"
                    onClick={() => { setShowManageAccount(false); navigate('/login') }}>
                    <div className="w-9 h-9 rounded-lg bg-[rgba(1,214,190,0.12)] flex items-center justify-center">
                      <User size={16} className="text-[#01D6BE]" />
                    </div>
                    <div className="flex-1 text-[13px] font-semibold text-[#01D6BE]">Sign In</div>
                    <ChevronRight size={16} className="text-[#01D6BE]" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(1,214,190,0.06)] cursor-pointer"
                    onClick={async () => { await logout() }}>
                    <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                      <LogOut size={16} className="text-[#FFFFFF]" />
                    </div>
                    <div className="flex-1 text-[13px] font-semibold text-[#FFFFFF]">Sign out</div>
                    <ChevronRight size={16} className="text-[#636366]" />
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(1,214,190,0.06)] cursor-pointer"
                  onClick={() => { setShowManageAccount(false); setShowResetConfirm(true) }}>
                  <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <RotateCcw size={16} className="text-[#FFFFFF]" />
                  </div>
                  <div className="flex-1 text-[13px] font-semibold text-[#FFFFFF]">Reset App</div>
                  <ChevronRight size={16} className="text-[#636366]" />
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer">
                  <div className="w-9 h-9 rounded-lg bg-[rgba(255,59,48,0.08)] flex items-center justify-center">
                    <Trash2 size={16} className="text-[#FF3B30]" />
                  </div>
                  <div className="flex-1 text-[13px] font-semibold text-[#FF3B30]">Delete Account</div>
                  <ChevronRight size={16} className="text-[#FF3B30]" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== Support Modal ==================== */}
      <AnimatePresence>
        {showSupport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => setShowSupport(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-[#262626] rounded-[28px] border border-[rgba(255,149,0,0.15)] overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,149,0,0.1)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(255,149,0,0.1)] flex items-center justify-center">
                    <Headphones size={20} className="text-[#FF9500]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF]">Feedback</h3>
                    <p className="text-caption text-[#A0A0A5]">We'd love to hear from you</p>
                  </div>
                </div>
                <button onClick={() => setShowSupport(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]"><X size={20} className="text-[#A0A0A5]" /></button>
              </div>
              <div className="p-5">
                {supportSubmitted ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-[rgba(52,199,89,0.1)] flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} className="text-[#34C759]" />
                    </div>
                    <h4 className="text-[15px] font-bold text-[#FFFFFF] mb-2">Feedback Submitted!</h4>
                    <p className="text-label text-[#A0A0A5]">We will get back to you within 24 hours.</p>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSupportSubmit} className="space-y-4">
                    <div>
                      <label className="text-label font-semibold text-[#A0A0A5] mb-2 flex items-center gap-2"><Mail size={14} />Your Email</label>
                      <input type="email" required value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="you@example.com"
                        className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)] text-[#FFFFFF] text-[13px] placeholder:text-[#636366] focus:outline-none focus:border-[rgba(1,214,190,0.4)] transition-colors" />
                    </div>
                    <div>
                      <label className="text-label font-semibold text-[#A0A0A5] mb-2 flex items-center gap-2"><FileText size={14} />Your Feedback</label>
                      <textarea required value={supportMessage} onChange={e => setSupportMessage(e.target.value)} placeholder="Describe your issue or suggestion..." rows={4}
                        className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)] text-[#FFFFFF] text-[13px] placeholder:text-[#636366] resize-none focus:outline-none focus:border-[rgba(1,214,190,0.4)] transition-colors" />
                    </div>
                    <button type="submit" className="w-full py-3.5 rounded-l bg-[rgba(255,149,0,0.12)] text-[#FF9500] font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-transform border border-[rgba(255,149,0,0.2)]">
                      <Send size={16} />Submit Feedback
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== Reset Confirm Modal ==================== */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
            onClick={() => setShowResetConfirm(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-[#262626] rounded-[28px] border border-[rgba(255,59,48,0.2)] overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-5 space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-[rgba(255,59,48,0.1)] flex items-center justify-center mx-auto mb-3">
                    <RotateCcw size={24} className="text-[#FF3B30]" />
                  </div>
                  <h3 className="text-base font-bold text-[#FFFFFF] mb-2">Reset App</h3>
                  <p className="text-[13px] text-[#A0A0A5]">All settings, device configurations, and membership data will be permanently deleted.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 rounded-l bg-[rgba(255,255,255,0.06)] text-[#FFFFFF] font-semibold text-[13px]">Cancel</button>
                  <button onClick={() => { resetAll(); setShowResetConfirm(false) }} className="flex-1 py-3 rounded-l bg-[rgba(255,59,48,0.15)] text-[#FF3B30] font-semibold text-[13px] border border-[rgba(255,59,48,0.3)]">Reset</button>
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
              className="w-full max-w-md bg-[#262626] rounded-[28px] border border-[rgba(255,215,0,0.2)] overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,215,0,0.1)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(255,215,0,0.1)] flex items-center justify-center"><Crown size={20} className="text-[#FFD700]" /></div>
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF]">Founder Badge</h3>
                    <p className="text-caption text-[#A0A0A5]">Unlock exclusive benefits</p>
                  </div>
                </div>
                <button onClick={() => setShowFounderModal(false)} className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)]"><X size={20} className="text-[#A0A0A5]" /></button>
              </div>
              <div className="p-5">
                {founderSuccess ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-[rgba(255,215,0,0.15)] flex items-center justify-center mx-auto mb-4"><Crown size={32} className="text-[#FFD700]" /></div>
                    <h4 className="text-[15px] font-bold text-[#FFD700] mb-2">Welcome, Founding Member!</h4>
                    <p className="text-label text-[#A0A0A5]">Your exclusive benefits are now active.</p>
                  </motion.div>
                ) : (
                  <>
                    <div className="mb-5">
                      <p className="text-label text-[#A0A0A5] mb-3">Founding Members enjoy:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {founderBenefits.map(b => { const Icon = b.icon; return (
                          <div key={b.label} className="flex items-center gap-2 bg-[rgba(255,215,0,0.05)] rounded-lg p-2">
                            <Icon size={14} className="text-[#FFD700]" /><span className="text-caption text-[#FFFFFF]">{b.label}</span>
                          </div>
                        )})}
                      </div>
                    </div>
                    <form onSubmit={handleFounderSubmit} className="space-y-4">
                      <div>
                        <label className="text-label font-semibold text-[#A0A0A5] mb-2 flex items-center gap-2"><Sparkles size={14} />Enter Code</label>
                        <input type="text" required value={founderCode} onChange={e => setFounderCode(e.target.value)} placeholder="e.g., FOUNDER2024"
                          className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(255,215,0,0.2)] text-[#FFFFFF] text-[13px] placeholder:text-[#636366] uppercase focus:outline-none focus:border-[rgba(255,215,0,0.5)] transition-colors" />
                      </div>
                      {founderMessage && <div className={`text-caption text-center ${founderSuccess ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>{founderMessage}</div>}
                      <button type="submit" className="w-full py-3.5 rounded-l bg-[rgba(255,215,0,0.12)] text-[#FFD700] font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-transform border border-[rgba(255,215,0,0.25)]">
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
        {showProfileEdit && <ProfileEditPage onBack={() => setShowProfileEdit(false)} />}
      </AnimatePresence>
    </div>
  )
}
