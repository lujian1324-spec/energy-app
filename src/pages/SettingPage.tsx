import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send,
  Loader2,
  CheckCircle,
  Gem,
  LogOut,
  RotateCcw,
  Cpu,
} from 'lucide-react'
import Icon from '../components/Icon'
import { FIRMWARE_UPDATE_ENABLED } from '../config/firmwareUpdate'
import { useKeyboardInset } from '../utils/useKeyboardInset'
import { FEEDBACK_TO_EMAIL, isEmailJsConfigured } from '../config/emailjs'
import { sendFeedbackEmail } from '../utils/sendFeedbackEmail'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useAuthStore } from '../stores/authStore'
import { toast } from '../components/Toast'
import {
  deleteAccountAndContents,
  deleteAccountProgressLabel,
  type DeleteAccountProgress,
} from '../utils/deleteAccountFlow'
import { useUserProfile } from '../hooks/useUserProfile'
import BottomSheet from '../components/BottomSheet'
import TextField from '../components/TextField'
import ToggleSwitch from '../components/ToggleSwitch'
import appVersion from '../version.json'
import ProfileEditPage from './ProfileEditPage'
import { requestNotificationPermission, getNotificationPermission, enableWebPush, disableWebPush } from '../utils/pushNotification'
import { PUSH_ENABLED } from '../config/webPush'
import { TERMS_URL, PRIVACY_URL } from '../config/legalLinks'
import { initNativePush, teardownNativePush, reuploadNativePushPrefs } from '../utils/nativePush'
import { Capacitor } from '@capacitor/core'
import { toUserFacingError } from '../utils/uiCopy'

export default function SettingPage() {
  const navigate = useNavigate()
  const { settings, updateSettings } = usePowerStationStore()
  const { user: authUser, logout, isGuest } = useAuthStore()
  const [showSupport, setShowSupport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState<DeleteAccountProgress | null>(null)

  // Support form
  const [supportEmail, setSupportEmail] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [supportSubmitted, setSupportSubmitted] = useState(false)


  // Profile - 从 authStore 获取登录账号信息
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  // The same loader Profile uses, so the name shown here is the name shown there.
  const { profile: userProfile, reload: reloadUserProfile } = useUserProfile()

  // Push notification settings
  const [pushOutage, setPushOutage] = useState(settings.pushNotifications)
  const [pushLowBattery, setPushLowBattery] = useState(settings.pushLowBattery ?? false)
  const [lowBatteryThreshold, setLowBatteryThreshold] = useState(settings.lowBatteryThreshold ?? 30)
  // This page stays mounted across sign-out / sign-in (APP-008), so the local
  // copies above must follow the store when another account's settings arrive.
  useEffect(() => { setPushOutage(settings.pushNotifications) }, [settings.pushNotifications])
  useEffect(() => { setPushLowBattery(settings.pushLowBattery ?? false) }, [settings.pushLowBattery])
  useEffect(() => { setLowBatteryThreshold(settings.lowBatteryThreshold ?? 30) }, [settings.lowBatteryThreshold])

  // 任一推送开关变化后，编排服务端推送：
  // - 打开任一开关 → 原生:接线 APNs/FCM 并上报 token;Web:VAPID 订阅 + 上报
  // - 全部关闭     → 注销
  const syncWebPush = useCallback(async (outage: boolean, lowBat: boolean) => {
    // Hidden channels (Device Alarms / Solar Status) still count as "push enabled"
    // so flipping a visible toggle cannot tear down a leftover subscription.
    const s = usePowerStationStore.getState().settings
    const alarms = s.pushDeviceAlarms ?? false
    const solar = s.pushSolarStatus ?? false
    const anyOn = outage || lowBat || solar || alarms
    if (Capacitor.isNativePlatform()) {
      if (anyOn) { await initNativePush(); await reuploadNativePushPrefs() }
      else await teardownNativePush()
      return
    }
    if (anyOn) {
      await enableWebPush()
    } else {
      await disableWebPush()
    }
  }, [])

  const [supportSending, setSupportSending] = useState(false)
  const [supportError, setSupportError] = useState('')
  // The dialog sits on the bottom edge on a phone, so the keyboard opens over it.
  const keyboardInset = useKeyboardInset()

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSupportSending(true)
    setSupportError('')

    // The form asks for an address, so what was typed wins; the profile address is
    // the fallback. The registration account is a username, not an address — sending
    // it as from_email is what made EmailJS reject the message.
    const typed = supportEmail.trim()
    const profileEmail = (userProfile?.email ?? '').trim()
    const fromEmail = typed || (profileEmail.includes('@') ? profileEmail : '')

    // Preferred path: send via EmailJS (recipient is fixed in the template).
    if (isEmailJsConfigured()) {
      try {
        await sendFeedbackEmail({ fromEmail, message: supportMessage })
        setSupportSubmitted(true)
        setTimeout(() => {
          setShowSupport(false)
          setSupportEmail('')
          setSupportMessage('')
          setSupportSubmitted(false)
          setSupportSending(false)
        }, 1500)
      } catch (err) {
        console.error('[SettingPage] feedback send failed:', err)
        setSupportError(toUserFacingError(err, 'Failed to send feedback. Please try again.'))
        setSupportSending(false)
      }
      return
    }

    // Fallback: open the user's mail client until EmailJS is configured.
    const subject = encodeURIComponent('Sierro App Feedback')
    const body = encodeURIComponent(fromEmail ? `From: ${fromEmail}\n\n${supportMessage}` : supportMessage)
    window.open(`mailto:${FEEDBACK_TO_EMAIL}?subject=${subject}&body=${body}`, '_blank')
    setSupportSubmitted(true)
    setTimeout(() => {
      setShowSupport(false)
      setSupportEmail('')
      setSupportMessage('')
      setSupportSubmitted(false)
      setSupportSending(false)
    }, 1500)
  }




  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-6 pb-4 safe-area-top">
        {/* User Profile — avatar + name + manage-account row, Founding Member gold tag */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-5">
          {/* Avatar: green ring (default) / gold ring (founder); default icon lightning / diamond */}
          <button
            onClick={() => isGuest ? navigate('/login') : setShowProfileEdit(true)}
            className="relative flex-shrink-0 active:scale-[0.96] transition-transform">
            <div className={`w-[52px] h-[52px] rounded-full flex items-center justify-center overflow-hidden border-m
              ${settings.founderBadge
                ? 'border-membership bg-membership/[0.06]'
                : 'border-primary bg-primary/[0.06]'}`}>
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
          {/* Founding Member gold tag. Not a button: membership now comes from
              the VIP roster at sign-up, so there is nothing for a tap to open —
              the Founder Badge card it used to raise was a code-redemption
              form, and redeeming could only overwrite a real member's number
              with a generated one. */}
          {settings.founderBadge && (
            <span className="flex-shrink-0 px-3 py-1 rounded-pill bg-membership/[0.18] border-s border-membership">
              <span className="text-label font-semibold text-membership whitespace-nowrap">
                Founding Member #{settings.founderBadgeNumber}
              </span>
            </span>
          )}
        </motion.div>

        {/* Push Notifications — hidden until push backend/credentials are ready (PUSH_ENABLED) */}
        {PUSH_ENABLED && (<>
        <h3 className="text-body-lg font-semibold text-ink-1 mb-3.5">Push Notifications</h3>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="space-y-3 mb-6">
          {/* Power Outage — Toggle on the right (ui-fix-doc-20260911/03).
              Shared Sierro list row (ui-fix-doc-20260911/04): 24px glyph in a
              36px circle, 14px title over a 10px subtitle. */}
          <div className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="outage" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-md font-semibold text-ink-2">Power Outage</div>
              <div className="text-tiny text-ink-4 mt-0.5">Get alerted during outages</div>
            </div>
            <ToggleSwitch
              isOn={pushOutage}
              ariaLabel="Power outage alerts"
              onToggle={async () => {
                const next = !pushOutage
                setPushOutage(next)
                updateSettings({ pushNotifications: next })
                if (next && getNotificationPermission() !== 'granted') {
                  await requestNotificationPermission()
                }
                await syncWebPush(next, pushLowBattery)
              }}
            />
          </div>

          {/* Low Battery — Toggle on the right; threshold lives in the slider
              below rather than in the subtitle (ui-fix-doc-20260911/03). */}
          <div className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="low-battery" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-md font-semibold text-ink-2">Low Battery</div>
              <div className="text-tiny text-ink-4 mt-0.5">Get notified when battery gets low.</div>
            </div>
            <ToggleSwitch
              isOn={pushLowBattery}
              ariaLabel="Low battery alerts"
              onToggle={async () => {
                const next = !pushLowBattery
                setPushLowBattery(next)
                updateSettings({ pushLowBattery: next })
                if (next && getNotificationPermission() !== 'granted') {
                  await requestNotificationPermission()
                }
                await syncWebPush(pushOutage, next)
              }}
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
                        void reuploadNativePushPrefs()
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
                            void reuploadNativePushPrefs()
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
        </motion.div>
        </>)}

        {/* Support */}
        <h3 className="text-body-lg font-semibold text-ink-1 mb-3">Support</h3>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mb-6">
          <button
            onClick={() => setShowSupport(true)}
            className="w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5 active:scale-[0.99] transition-transform text-left">
            <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="feedback" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-md font-semibold text-ink-2">Feedback</div>
              <div className="text-tiny text-ink-4 mt-0.5">Send feedback to the Sierro team</div>
            </div>
          </button>
          {/* v4.20.0: below Feedback. Not released yet — config/firmwareUpdate.ts. */}
          {FIRMWARE_UPDATE_ENABLED && (
            <button
              onClick={() => navigate('/firmware-update')}
              className="mt-3 w-full flex items-center gap-3 bg-ink-10 rounded-l px-4 py-3.5 active:scale-[0.99] transition-transform text-left">
              <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
                <Cpu size={20} className="text-white" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-body-md font-semibold text-ink-2">Firmware Update</div>
                <div className="text-tiny text-ink-4 mt-0.5">Check your devices for new firmware</div>
              </div>
            </button>
          )}
        </motion.div>

        {/* Legal + Version */}
        <div className="text-center py-2 leading-relaxed">
          <div className="flex items-center justify-center gap-2 mb-1">
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-label font-semibold text-primary hover:opacity-80 transition-opacity">
              Privacy Policy
            </a>
            <span className="text-ink-7">|</span>
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-label font-semibold text-primary hover:opacity-80 transition-opacity">
              Terms of Use
            </a>
          </div>
          <p className="text-tiny text-ink-6">
            Sierro App v{appVersion.version} @2026 Sierro Inc.
          </p>
        </div>
      </div>

      {/* ==================== Support Modal ==================== */}
      <AnimatePresence>
        {showSupport && (
          /* D_1.3.1_Feedback: the handoff sheet — handle and close from the shared
             chrome, the title left at y206, two outlined fields at y250 and y330,
             and the filled Send Feedback button at y474. The old build was a
             centred dialog with its own header, icons beside the labels and a
             grey submit; none of that is in the frame. Sending is unchanged. */
          <BottomSheet ariaLabel="Feedback" onClose={() => setShowSupport(false)}>
            <div className="mt-[30px] px-6 pb-4">
              <h2 className="text-title-lg font-semibold text-white">Feedback</h2>

              {supportSubmitted ? (
                <div className="mt-8 mb-10 text-center">
                  <div className="w-16 h-16 rounded-full bg-success/[0.1] flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} className="text-success" />
                  </div>
                  <h3 className="text-body-lg font-semibold text-ink-1 mb-2">Feedback Submitted!</h3>
                  <p className="text-label text-ink-6">We will get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSupportSubmit}>
                  <div className="mt-6">
                    <TextField
                      outlined
                      dense
                      label="Your Contact Email"
                      ariaLabel="Your contact email"
                      type="email"
                      inputMode="email"
                      value={supportEmail}
                      onChange={setSupportEmail}
                      placeholder="you@example.com"
                    />
                  </div>
                  {/* Text Area — no rule, auto-grows 120→210 (ui-fix-doc-20260911/07). */}
                  <div className="mt-3">
                    <TextField
                      outlined
                      label="Your Feedback"
                      ariaLabel="Your feedback"
                      rows={3}
                      value={supportMessage}
                      onChange={setSupportMessage}
                      placeholder="Describe your issue or suggestion..."
                    />
                  </div>
                  {supportError && <p className="mt-3 text-label text-danger text-center">{supportError}</p>}
                  <button
                    type="submit"
                    disabled={supportSending || !supportMessage.trim()}
                    className="mt-6 w-full h-12 rounded-m bg-primary text-primary-darker font-semibold text-body-lg
                      flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {supportSending && <Loader2 size={16} className="animate-spin" />}
                    {supportSending ? 'Sending…' : 'Send Feedback'}
                  </button>
                </form>
              )}
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* ==================== Delete Account Confirm ==================== */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-4"
            onClick={() => !deleteLoading && setShowDeleteConfirm(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-ink-10 rounded-[28px] border border-danger/[0.2] overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-5 space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-danger/[0.1] flex items-center justify-center mx-auto mb-3">
                    <Icon name="trash" size={24} />
                  </div>
                  <h3 className="text-base font-bold text-ink-1 mb-2">Delete Account</h3>
                  <p className="text-body-md text-ink-6">This deletes your devices and power stations as well as your account and all associated data. This action cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <button disabled={deleteLoading} onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-3 rounded-l bg-white/[0.06] text-ink-1 font-semibold text-body-md disabled:opacity-50">
                    Cancel
                  </button>
                  <button disabled={deleteLoading} onClick={async () => {
                    /*
                     * Devices, then stations, then the account. This used to
                     * call the account delete alone, swallow whatever came
                     * back and sign out regardless — so an account the backend
                     * had REFUSED to delete (because it still owned a station)
                     * looked deleted to the person who asked for it. Now a
                     * failure is shown and the session is kept, so they still
                     * have an account to try again with.
                     */
                    setDeleteLoading(true)
                    setDeleteProgress(null)
                    const res = await deleteAccountAndContents(setDeleteProgress)
                    setDeleteLoading(false)
                    setDeleteProgress(null)
                    if (!res.ok) {
                      toast.error(res.message ?? 'Failed to delete account. Please try again.')
                      return
                    }
                    await logout()
                    setShowDeleteConfirm(false)
                  }}
                    className="flex-1 py-3 rounded-l bg-danger/[0.15] text-danger font-semibold text-body-md border border-danger/[0.3] flex items-center justify-center gap-2 disabled:opacity-50">
                    {deleteLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {deleteAccountProgressLabel(deleteProgress)}
                      </>
                    ) : 'Delete'}
                  </button>
                </div>
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
