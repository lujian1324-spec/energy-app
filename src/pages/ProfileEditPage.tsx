import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import {
  ChevronLeft,
  User,
  Mail,
  Camera,
  Check,
  X,
  ChevronRight,
  Hash,
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useAuthStore } from '../stores/authStore'
import { saveUserProfile, getUserProfile } from '../db/powerflowDB'
import { toast } from '../components/Toast'
import {
  fetchUserInfo,
  updateUserInfo,
  updateUserEmail,
  updatePassword,
  sendEmailCaptcha,
} from '../api/authApi'
import { Lock, Eye, EyeOff } from 'lucide-react'
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
  const [userId, setUserId] = useState<number | null>(null)

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

  // Password change
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  // "..." dropdown menu
  const [showMenu, setShowMenu] = useState(false)

  // 二次确认弹窗：'signout' | 'delete' | null
  const [confirmAction, setConfirmAction] = useState<'signout' | 'delete' | null>(null)

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
            setUserId(u.userId ?? null)
            setProfile(prev => ({
              ...prev,
              name: u.nickname ?? u.account ?? prev.name,
              email: u.email ?? prev.email,
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
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const handleSave = async () => {
    if (!editingField) return
    setIsSaving(true)
    setFieldError('')
    try {
      if (editingField === 'name') {
        const r = await updateUserInfo({ userId: userId ?? undefined, nickname: tempValue })
        if (r.code !== 0 && r.code !== '0') throw new Error(r.message ?? 'Failed')
        const newProfile = { ...profile, name: tempValue }
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

      } else if (editingField === 'password') {
        if (!oldPassword) { setFieldError('Enter your current password'); return }
        if (newPassword.length < 6) { setFieldError('New password must be at least 6 characters'); return }
        if (newPassword !== confirmPassword) { setFieldError('Passwords do not match'); return }
        const r = await updatePassword(oldPassword, newPassword)
        if (r.code !== 0 && r.code !== '0') throw new Error(r.message ?? 'Failed')
        toast.success('Password updated')
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

  // 弹窗内确认 → 执行登出/删除
  const handleConfirm = () => {
    setConfirmAction(null)
    if (typeof logout === 'function') {
      logout()
    }
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
    const titleMap: Record<string, string> = { name: 'Name', email: 'Linked Email', password: 'Change Password' }
    const title = titleMap[editingField] ?? editingField

    return (
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-50 bg-[#141414] flex flex-col"
      >
        {/* Sub-screen header */}
        <div className="px-4 pt-4 pb-4 safe-area-top flex items-center justify-between">
          <button
            onClick={handleCancel}
            className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
          <span className="text-title-lg font-semibold text-white">{title}</span>
          {editingField !== 'email' && editingField !== 'password' ? (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center disabled:opacity-40"
            >
              <Check size={18} className="text-[#01D6BE]" />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-6 space-y-4">

          {/* ── NAME ── */}
          {editingField === 'name' && (
            <div className="bg-[#262626] rounded-l overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <User size={16} className="text-[#BFBFBF] flex-shrink-0" />
                <input
                  type="text"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                  className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] focus:outline-none"
                />
                {tempValue.length > 0 && (
                  <button onClick={() => setTempValue('')}><X size={16} className="text-[#8C8C8C]" /></button>
                )}
              </div>
            </div>
          )}

          {/* ── EMAIL ── */}
          {editingField === 'email' && (
            <>
              <div className="bg-[#262626] rounded-l overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Mail size={16} className="text-[#BFBFBF] flex-shrink-0" />
                  <input
                    type="email"
                    value={tempValue}
                    onChange={(e) => { setTempValue(e.target.value); setEmailOtpSent(false) }}
                    placeholder="New email address"
                    autoFocus
                    disabled={emailOtpSent}
                    className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>
              {emailOtpSent && (
                <div className="bg-[#262626] rounded-l overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Mail size={16} className="text-[#BFBFBF] flex-shrink-0" />
                    <input
                      type="text"
                      value={emailOtpCode}
                      onChange={(e) => setEmailOtpCode(e.target.value)}
                      placeholder="Verification code"
                      autoFocus
                      maxLength={8}
                      className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] focus:outline-none"
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving || (!emailOtpSent && !tempValue)}
                className="w-full h-12 rounded-full bg-[#01D6BE] text-black font-semibold text-body-md disabled:opacity-40"
              >
                {isSaving ? 'Please wait…' : emailOtpSent ? 'Confirm Update' : emailCooldown > 0 ? `Resend (${emailCooldown}s)` : 'Send Verification Code'}
              </button>
            </>
          )}

          {/* ── PASSWORD ── */}
          {editingField === 'password' && (
            <>
              {/* Old password */}
              <div className="bg-[#262626] rounded-l overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Lock size={16} className="text-[#BFBFBF] flex-shrink-0" />
                  <input
                    type={showOldPwd ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Current password"
                    autoFocus
                    className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] focus:outline-none"
                  />
                  <button onClick={() => setShowOldPwd(v => !v)}>
                    {showOldPwd ? <EyeOff size={16} className="text-[#8C8C8C]" /> : <Eye size={16} className="text-[#8C8C8C]" />}
                  </button>
                </div>
              </div>
              {/* New password */}
              <div className="bg-[#262626] rounded-l overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                  <Lock size={16} className="text-[#BFBFBF] flex-shrink-0" />
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (6–32 chars)"
                    className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] focus:outline-none"
                  />
                  <button onClick={() => setShowNewPwd(v => !v)}>
                    {showNewPwd ? <EyeOff size={16} className="text-[#8C8C8C]" /> : <Eye size={16} className="text-[#8C8C8C]" />}
                  </button>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <Lock size={16} className="text-[#BFBFBF] flex-shrink-0" />
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] focus:outline-none"
                  />
                  <button onClick={() => setShowConfirmPwd(v => !v)}>
                    {showConfirmPwd ? <EyeOff size={16} className="text-[#8C8C8C]" /> : <Eye size={16} className="text-[#8C8C8C]" />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || !oldPassword || !newPassword || !confirmPassword}
                className="w-full h-12 rounded-full bg-[#01D6BE] text-black font-semibold text-body-md disabled:opacity-40"
              >
                {isSaving ? 'Updating…' : 'Update Password'}
              </button>
            </>
          )}

          {/* Error message */}
          {fieldError ? (
            <p className="text-danger text-body-md text-center">{fieldError}</p>
          ) : null}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-40 bg-[#141414] flex flex-col"
    >
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 safe-area-top flex items-center justify-between relative">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>

        <span className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
          Profile
        </span>

        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
          >
            <span className="text-white text-body-lg leading-none tracking-widest">···</span>
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <>
              {/* Backdrop to close */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-12 z-20 w-44 bg-[#262626] rounded-l shadow-xl overflow-hidden border border-white/10">
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-3 text-body-md text-white hover:bg-white/5 transition-colors"
                >
                  Sign out
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={handleDeleteAccount}
                  className="w-full text-left px-4 py-3 text-body-md text-[#FF3B30] hover:bg-white/5 transition-colors"
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
        <div className="flex flex-col items-center pt-8 pb-4">
          <div className="relative cursor-pointer" onClick={handleAvatarClick}>
            <div className={`w-24 h-24 rounded-full border-2 overflow-hidden bg-[#262626] flex items-center justify-center ${
              settings.founderBadge ? 'border-[#FFD700]' : 'border-[#01D6BE]'
            }`}>
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={40} className="text-[#BFBFBF]" />
              )}
            </div>
            {/* Pencil edit overlay bottom-right */}
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#01D6BE] flex items-center justify-center border-2 border-[#141414]">
              <Camera size={13} className="text-black" />
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

          {/* Founder badge pill */}
          {settings.founderBadge && (
            <span className="mt-3 flex items-center gap-1 px-3 py-1 rounded-full bg-[rgba(255,215,0,0.15)] text-[#FFD700] border border-[#FFD700] text-caption">
              👑 Founding Member #{settings.founderBadgeNumber}
            </span>
          )}
        </div>

        {/* Personal Info section */}
        <p className="text-body-md font-semibold text-white mt-6 mb-2">Personal Info</p>
        <div className="bg-[#262626] rounded-l overflow-hidden">
          {/* Name row */}
          <button
            onClick={() => handleEdit('name', profile.name)}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-white/5 text-left"
          >
            <User size={18} className="text-[#BFBFBF] flex-shrink-0" />
            <span className="text-body-md text-white flex-1">Name</span>
            <span className="text-body-md text-[#BFBFBF] truncate max-w-[140px]">{profile.name}</span>
            <ChevronRight size={16} className="text-[#8C8C8C] flex-shrink-0" />
          </button>

          {/* Linked Email row */}
          <button
            onClick={() => handleEdit('email', profile.email)}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-white/5 text-left"
          >
            <Mail size={18} className="text-[#BFBFBF] flex-shrink-0" />
            <span className="text-body-md text-white flex-1">Linked Email</span>
            <span className="text-body-md text-[#BFBFBF] truncate max-w-[140px]">{profile.email}</span>
            <ChevronRight size={16} className="text-[#8C8C8C] flex-shrink-0" />
          </button>

          {/* User ID row (read-only) */}
          {userId !== null && (
            <div className="w-full flex items-center gap-3 px-4 py-4 border-t border-white/5">
              <Hash size={18} className="text-[#BFBFBF] flex-shrink-0" />
              <span className="text-body-md text-white flex-1">User ID</span>
              <span className="text-body-md text-[#BFBFBF]">#{userId}</span>
            </div>
          )}
        </div>

        {/* Security section */}
        <p className="text-body-md font-semibold text-white mt-5 mb-2">Security</p>
        <div className="bg-[#262626] rounded-l overflow-hidden">
          <button
            onClick={() => handleEdit('password', '')}
            className="w-full flex items-center gap-3 px-4 py-4 text-left"
          >
            <Lock size={18} className="text-[#BFBFBF] flex-shrink-0" />
            <span className="text-body-md text-white flex-1">Change Password</span>
            <ChevronRight size={16} className="text-[#8C8C8C] flex-shrink-0" />
          </button>
        </div>

        {/* Link Accounts section */}
        <p className="text-body-md font-semibold text-white mt-5 mb-2">Link Accounts</p>
        <div className="bg-[#262626] rounded-l overflow-hidden">
          {/* Google row */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="text-body-md text-white flex-1">Google</span>
            <span className="text-body-md text-[#BFBFBF] mr-2">Not linked</span>
            <button
              onClick={() => toast.error('Google login coming soon')}
              className="h-8 px-4 rounded-full bg-[#01D6BE] text-black text-label font-semibold"
            >
              Link
            </button>
          </div>

          {/* Apple row */}
          <div className="flex items-center gap-3 px-4 py-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="flex-shrink-0">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            <span className="text-body-md text-white flex-1">Apple</span>
            <span className="text-body-md text-[#BFBFBF] mr-2">Not linked</span>
            <button
              onClick={() => toast.error('Apple login coming soon')}
              className="h-8 px-4 rounded-full border border-[#01D6BE] text-[#01D6BE] text-label font-semibold"
            >
              Link
            </button>
          </div>
        </div>

        {/* Footer: founder code */}
        {!settings.founderBadge && (
          <p className="mt-6 text-center text-caption text-[#BFBFBF]">
            Have a founder code?{' '}
            <button
              onClick={() => { setFounderCode(''); setFounderError(''); setShowRedeem(true) }}
              className="text-[#01D6BE] underline text-caption"
            >
              Redeem founder badge
            </button>
          </p>
        )}
      </div>

      {/* ==================== Redeem Founder Badge 弹窗 (bottom sheet) ==================== */}
      <AnimatePresence>
        {showRedeem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-black/60"
            onClick={() => setShowRedeem(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#262626] rounded-t-[24px] px-6 pt-3 pb-8 safe-area-bottom"
            >
              {/* Grabber */}
              <div className="w-9 h-1 rounded-full bg-[#5A5A5A] mx-auto mb-5" />

              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <h3 className="text-headline-md font-bold text-white">Redeem Founder Badge</h3>
                <button
                  onClick={() => setShowRedeem(false)}
                  className="w-8 h-8 rounded-full bg-[#3A3A3A] flex items-center justify-center flex-shrink-0"
                >
                  <X size={16} className="text-[#BFBFBF]" />
                </button>
              </div>

              {/* Activation Code input */}
              <div className={`rounded-m border px-4 pt-2.5 pb-3 mb-4 ${founderError ? 'border-[#FF3B30]' : 'border-[#4A4A4A]'}`}>
                <label className="text-label text-[#BFBFBF]">Activation Code</label>
                <input
                  type="text"
                  value={founderCode}
                  onChange={(e) => { setFounderCode(e.target.value); setFounderError('') }}
                  placeholder="Enter your code"
                  autoFocus
                  className="w-full bg-transparent text-title-md text-white placeholder:text-[#8C8C8C] focus:outline-none mt-0.5"
                />
              </div>

              {founderError && (
                <p className="text-body-md text-[#FF3B30] mb-3 -mt-1">{founderError}</p>
              )}

              {/* Activate button */}
              <button
                onClick={handleActivateBadge}
                disabled={!founderCode.trim()}
                className="w-full h-14 rounded-m bg-[#01D6BE] text-black font-semibold text-body-lg active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100"
              >
                Activate Badge
              </button>
            </motion.div>
          </motion.div>
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
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] bg-[#262626] rounded-l px-6 pt-6 pb-5"
            >
              <h3 className="text-headline-md font-bold text-white text-center mb-2">
                {confirmAction === 'signout' ? 'Sign out?' : 'Delete Account?'}
              </h3>
              <p className="text-body-md text-[#BFBFBF] text-center mb-6 leading-snug">
                {confirmAction === 'signout'
                  ? "You'll need to sign in again to access your account."
                  : 'This will permanently delete your account and all data. This action cannot be undone.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 h-12 rounded-m border-s border-white text-white font-semibold text-body-lg active:scale-95 transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 h-12 rounded-m font-semibold text-body-lg active:scale-95 transition-transform ${
                    confirmAction === 'signout'
                      ? 'bg-[#01D6BE] text-black'
                      : 'bg-[#FF3B30] text-white'
                  }`}
                >
                  {confirmAction === 'signout' ? 'Sign Out' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
