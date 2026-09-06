import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import {
} from 'lucide-react'
import Icon from '../components/Icon'
import TextField from '../components/TextField'
import BottomSheet from '../components/BottomSheet'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useAuthStore } from '../stores/authStore'
import { saveUserProfile, getUserProfile } from '../db/powerflowDB'
import { toast } from '../components/Toast'
import {
  fetchUserInfo,
  updateUserInfo,
  updateUserEmail,
  sendEmailCaptcha,
  deleteAccount,
} from '../api/authApi'
import { isApiSuccess } from '../utils/apiClient'
import type { UserProfile } from '../types/protocol'

interface ProfileEditPageProps {
  onBack: () => void
}

export default function ProfileEditPage({ onBack }: ProfileEditPageProps) {
  const { settings, activateFounderBadge } = usePowerStationStore()
  const { user: authUser, logout } = useAuthStore()

  // 用户个人信息状态 - 从 authStore 获取登录账号
  const [profile, setProfile] = useState<UserProfile>({
    name: authUser?.account ?? '',
    email: authUser?.account ?? '',
    avatar: null,
    memberSince: new Date().toISOString().slice(0, 10),
  })

  // 用户 ID（从服务端获取）

  // 加载状态
  const [isLoading, setIsLoading] = useState(true)

  // 编辑状态
  const [editingField, setEditingField] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [fieldError, setFieldError] = useState('')

  // Email OTP flow
  const [emailOtpSent, setEmailOtpSent] = useState(false)
  const [emailCaptchaId, setEmailCaptchaId] = useState('')
  const [emailOtpCode, setEmailOtpCode] = useState('')
  const [emailCooldown, setEmailCooldown] = useState(0)


  // "..." dropdown menu
  const [showMenu, setShowMenu] = useState(false)

  // 二次确认弹窗：'signout' | 'delete' | null
  const [confirmAction, setConfirmAction] = useState<'signout' | 'delete' | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Redeem Founder Badge 弹窗
  const [showRedeem, setShowRedeem] = useState(false)
  const [founderCode, setFounderCode] = useState('')
  const [founderError, setFounderError] = useState('')

  // 头像上传
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 加载用户资料
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const savedProfile = await getUserProfile()
        if (savedProfile) {
          setProfile(savedProfile)
        }
        // Fetch live user info from server
        const apiResult = await fetchUserInfo()
        if (apiResult.code === 0 || apiResult.code === '0') {
          const u = apiResult.data
          if (u) {
            setProfile(prev => ({
              ...prev,
              // `Profile -v Default` shows an editable display name, so prefer the
              // nickname and fall back to the account it was registered with.
              name: u.nickname || u.account || prev.name,
              // /user/select/iotUserInfo returns the address masked (j****@sierro.us).
              // The design shows it in full, and the login response already gave us the
              // real one, so only take the server's value when it is not masked.
              email: u.email && !u.email.includes('*') ? u.email : prev.email,
            }))
          }
        }
      } catch (error) {
        console.error('Failed to load user profile:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadProfile()
  }, [])

  // 保存用户资料到 IndexedDB
  const persistProfile = async (newProfile: UserProfile) => {
    try {
      await saveUserProfile({
        ...newProfile,
        updatedAt: Date.now(),
      })
    } catch (error) {
      console.error('Failed to save user profile:', error)
    }
  }

  const handleEdit = (field: string, currentValue: string) => {
    setEditingField(field)
    setTempValue(currentValue)
    setFieldError('')
    setEmailOtpSent(false)
    setEmailOtpCode('')
    setEmailCaptchaId('')
    setEmailCooldown(0)
  }

  const handleSave = async () => {
    if (!editingField) return
    setIsSaving(true)
    setFieldError('')
    try {
      if (editingField === 'name') {
        const next = tempValue.trim()
        if (!next) { setFieldError('Enter a name'); return }
        const r = await updateUserInfo({ nickname: next })
        if (r.code !== 0 && r.code !== '0') throw new Error(r.message ?? 'Failed')
        const newProfile = { ...profile, name: next }
        setProfile(newProfile)
        await persistProfile(newProfile)
        toast.success('Name updated')

      } else if (editingField === 'email') {
        if (!emailOtpSent) {
          // Step 1: send OTP
          const r = await sendEmailCaptcha(tempValue, '4')
          if (r.code !== 0 && r.code !== '0') throw new Error(r.message ?? 'Failed to send code')
          setEmailCaptchaId(r.data?.iotCaptchaId ?? '')
          setEmailOtpSent(true)
          setEmailCooldown(60)
          const timer = setInterval(() => {
            setEmailCooldown(c => { if (c <= 1) { clearInterval(timer); return 0 } return c - 1 })
          }, 1000)
          return // stay on screen, wait for OTP
        } else {
          // Step 2: submit OTP
          if (emailOtpCode.length < 4) { setFieldError('Enter the verification code'); return }
          const r = await updateUserEmail(tempValue, emailCaptchaId, emailOtpCode)
          if (r.code !== 0 && r.code !== '0') throw new Error(r.message ?? 'Failed')
          const newProfile = { ...profile, email: tempValue }
          setProfile(newProfile)
          await persistProfile(newProfile)
          toast.success('Email updated')
        }

      }

      setEditingField(null)
      setTempValue('')
    } catch (err: unknown) {
      setFieldError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingField(null)
    setTempValue('')
    setFieldError('')
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const avatarData = event.target?.result as string
        const newProfile = { ...profile, avatar: avatarData }
        setProfile(newProfile)
        await persistProfile(newProfile)
      }
      reader.readAsDataURL(file)
    }
  }

  // 点击菜单项 → 打开对应的二次确认弹窗
  const handleSignOut = () => {
    setShowMenu(false)
    setConfirmAction('signout')
  }

  const handleDeleteAccount = () => {
    setShowMenu(false)
    setConfirmAction('delete')
  }

  // 弹窗内确认 → 执行登出 / 真正删除账号
  const handleConfirm = async () => {
    if (confirmAction === 'delete') {
      // 真正调用注销账户接口（此前只登出，不满足 Apple 5.1.1(v) / Play 删除政策）
      setDeleteBusy(true)
      try {
        const res = await deleteAccount()
        if (!isApiSuccess(res.code)) {
          toast.error(res.message || res.msg || 'Failed to delete account. Please try again.')
          setDeleteBusy(false)
          return
        }
      } catch {
        toast.error('Failed to delete account. Please try again.')
        setDeleteBusy(false)
        return
      }
      setDeleteBusy(false)
      setConfirmAction(null)
      // 账号已在服务端删除 → 清本地会话/数据并退出
      if (typeof logout === 'function') logout()
      onBack()
      return
    }
    // signout
    setConfirmAction(null)
    if (typeof logout === 'function') logout()
    onBack()
  }

  // 激活 Founder Badge：验证码正确则点亮徽章
  const handleActivateBadge = () => {
    const result = activateFounderBadge(founderCode.trim())
    if (result.success) {
      setShowRedeem(false)
      setFounderCode('')
      setFounderError('')
      toast.success('Founder badge activated')
    } else {
      setFounderError(result.message)
    }
  }

  // If editing a field, show sub-screen
  if (editingField) {
    const titleMap: Record<string, string> = { name: 'Name', email: 'Linked Email' }
    const title = titleMap[editingField] ?? editingField

    return (
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-50 bg-ink-12 flex flex-col"
      >
        {/* Sub-screen header */}
        <div className="px-4 pt-4 pb-4 safe-area-top flex items-center justify-between">
          <button
            onClick={handleCancel}
            className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center"
          >
            <Icon name="chevron-left" size={24} />
          </button>
          <span className="text-title-lg font-semibold text-white">{title}</span>
          {editingField !== 'email' ? (
            <button
              onClick={handleSave}
              disabled={isSaving || tempValue.trim() === profile.name}
              className={`text-body-lg font-semibold transition-colors ${
                !isSaving && tempValue.trim() !== profile.name ? 'text-primary' : 'text-primary/30 cursor-not-allowed'
              }`}
            >
              Save
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-2 space-y-4">

          {/* ── NAME (D_2.5) ── */}
          {editingField === 'name' && (
            <TextField
              ariaLabel="Name"
              value={tempValue}
              onChange={setTempValue}
              onClear={() => setTempValue('')}
              placeholder="Your name"
              maxLength={40}
              autoFocus
            />
          )}

          {/* ── LINKED EMAIL (D_2.6) ── */}
          {editingField === 'email' && (
            <>
              <TextField
                type="email"
                inputMode="email"
                ariaLabel="New email address"
                value={tempValue}
                onChange={(next) => { setTempValue(next); setEmailOtpSent(false) }}
                onClear={emailOtpSent ? undefined : () => setTempValue('')}
                placeholder="New email address"
                autoFocus
              />
              {emailOtpSent && (
                <TextField
                  ariaLabel="Verification code"
                  value={emailOtpCode}
                  onChange={setEmailOtpCode}
                  placeholder="Verification code"
                  maxLength={8}
                />
              )}
            </>
          )}

          {/* Error message */}
          {fieldError ? (
            <p className="text-danger text-body-md text-center">{fieldError}</p>
          ) : null}
        </div>
        {/* D_2.6 pins the action to the bottom edge rather than stacking it under
            the field, the same way the sign-in flow does. */}
        {editingField === 'email' && (
          <div
            className="border-t border-ink-9 px-4 pt-3"
            style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)) + 16px)' }}
          >
            <button
              onClick={handleSave}
              disabled={isSaving || (!emailOtpSent && !tempValue)}
              className="w-full h-11 rounded-m bg-primary text-primary-darker font-semibold text-body-lg disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {isSaving ? 'Please wait…' : emailOtpSent ? 'Confirm Update' : emailCooldown > 0 ? `Resend (${emailCooldown}s)` : 'Verify New Email'}
            </button>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-40 bg-ink-12 flex flex-col"
    >
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 safe-area-top flex items-center justify-between relative">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center"
        >
          <Icon name="chevron-left" size={24} />
        </button>

        <span className="text-title-md font-semibold text-white absolute left-1/2 -translate-x-1/2">
          Profile
        </span>

        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center"
          >
            <Icon name="more-hor" size={24} />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <>
              {/* Backdrop to close */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-12 z-20 w-44 bg-ink-10 rounded-l shadow-xl overflow-hidden border border-white/10">
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-4 text-body-md text-white hover:bg-white/5 transition-colors"
                >
                  Sign out
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={handleDeleteAccount}
                  className="w-full text-left px-4 py-4 text-body-md text-danger hover:bg-white/5 transition-colors"
                >
                  Delete Account
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-8">

        {/* Avatar section */}
        {/* `Profile -v Default` puts the 96px avatar at y166. */}
        <div className="flex flex-col items-center pt-12 pb-4">
          <div className="relative cursor-pointer" onClick={handleAvatarClick}>
            {/* 96px overall: a 4px ring, 4px of page ground, then the 80px disc. */}
            <div className={`w-24 h-24 rounded-full border-4 p-1 ${
              settings.founderBadge ? 'border-membership' : 'border-primary'
            }`}>
              <div className="w-full h-full rounded-full overflow-hidden bg-ink-10 flex items-center justify-center">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  /* `Profile -v Default 無頭貼` uses the Sierro bolt, in primary. */
                  <Icon name="thunder" size={40} color="#01D6BE" />
                )}
              </div>
            </div>
            {/* Pencil badge: 32px ink-8 disc, 2px white border, white glyph. */}
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-ink-8 flex items-center justify-center border-2 border-white">
              <Icon name="edit" size={15} />
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Founder badge pill — tap to open redeem modal (APP-005: CTA hidden for non-founders) */}
          {settings.founderBadge && (
            <button
              type="button"
              onClick={() => { setFounderCode(''); setFounderError(''); setShowRedeem(true) }}
              className="mt-3 flex items-center gap-1 px-3 py-1 rounded-full bg-membership/[0.15] text-membership border border-membership text-caption"
            >
              👑 Founding Member #{settings.founderBadgeNumber}
            </button>
          )}
        </div>

        {/* Personal Info section */}
        <p className="text-body-md font-semibold text-white mt-8 mb-3.5">Personal Info</p>
        {/* Profile -v Default: each field is its own 68px card 12 apart, with a 40px
            ink-9 icon circle and the label in body_large/ink-2. */}
        <div className="space-y-3">
          {/* Name row — editable display name (D_2.5) */}
          <button
            onClick={() => handleEdit('name', profile.name)}
            className="w-full rounded-l bg-ink-10 h-[68px] px-4 flex items-center gap-3 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="user" size={24} />
            </div>
            <span className="text-body-lg text-ink-2 flex-1">Name</span>
            <span className="text-body-md text-ink-6 truncate max-w-[140px]">{profile.name}</span>
            <Icon name="chevron-right" size={24} />
          </button>

          {/* Linked Email row */}
          <button
            onClick={() => handleEdit('email', profile.email)}
            className="w-full rounded-l bg-ink-10 h-[68px] px-4 flex items-center gap-3 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
              <Icon name="email" size={24} />
            </div>
            <span className="text-body-lg text-ink-2 flex-1">Linked Email</span>
            <span className="text-body-md text-ink-6 truncate max-w-[140px]">{profile.email}</span>
            <Icon name="chevron-right" size={24} />
          </button>

        </div>


        {/* Footer: founder redeem CTA, as `Profile -v Default` has it. The gold badge
            still opens the same modal for members who already redeemed. */}
        {!settings.founderBadge && (
          <p className="mt-6 text-caption text-ink-7 text-center">
            Have a founder code?{' '}
            <button onClick={() => setShowRedeem(true)} className="text-primary font-semibold">
              Redeem founder badge
            </button>
          </p>
        )}
      </div>

      {/* ==================== Redeem Founder Badge 弹窗 (bottom sheet) ==================== */}
      <AnimatePresence>
        {showRedeem && (
          <BottomSheet
            title="Redeem Founder Badge"
            titleAlign="left"
            labelledBy="redeem-title"
            onClose={() => setShowRedeem(false)}
          >
            <div className="mt-6 px-6">
              <TextField
                outlined
                label="Activation Code"
                ariaLabel="Activation code"
                value={founderCode}
                onChange={(next) => { setFounderCode(next); setFounderError('') }}
                placeholder="e.g. FOUNDER2024"
                error={founderError || null}
                autoFocus
              />
            </div>
            <div className="mt-6 px-6">
              <button
                onClick={handleActivateBadge}
                disabled={!founderCode.trim()}
                className="w-full h-12 rounded-m bg-primary text-primary-darker font-semibold text-body-lg active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
              >
                Activate Badge
              </button>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      {/* ==================== 二次确认弹窗 (Sign out / Delete Account) ==================== */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-8"
            onClick={() => { if (!deleteBusy) setConfirmAction(null) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[280px] bg-ink-10 rounded-l px-4 pb-4 pt-[22px]"
            >
              <h3 className="text-title-lg font-semibold text-white text-center">
                {confirmAction === 'signout' ? 'Sign out?' : 'Delete account?'}
              </h3>
              <p className="mt-1.5 text-label text-ink-5 text-center">
                {confirmAction === 'signout'
                  ? "You'll need to sign in again to access your account."
                  : "This will permanently delete your account and saved data. This action can't be undone."}
              </p>
              <div className="mt-[18px] flex gap-3">
                <button
                  disabled={deleteBusy}
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 h-11 rounded-m border-s border-ink-4 text-ink-4 font-semibold text-body-lg active:scale-95 transition-transform disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={deleteBusy}
                  onClick={handleConfirm}
                  className={`flex-1 h-11 rounded-m font-semibold text-body-lg active:scale-95 transition-transform disabled:opacity-60 ${
                    confirmAction === 'signout'
                      ? 'bg-primary text-primary-darker'
                      : 'bg-danger text-white'
                  }`}
                >
                  {confirmAction === 'signout' ? 'Sign Out' : deleteBusy ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
