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
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useAuthStore } from '../stores/authStore'
import { saveUserProfile, getUserProfile } from '../db/powerflowDB'
import { toast } from '../components/Toast'
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

  // 加载状态
  const [isLoading, setIsLoading] = useState(true)

  // 编辑状态
  const [editingField, setEditingField] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState('')

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
  }

  const handleSave = async () => {
    if (editingField) {
      const newProfile = { ...profile, [editingField]: tempValue }
      setProfile(newProfile)
      await persistProfile(newProfile)
      setEditingField(null)
      setTempValue('')
    }
  }

  const handleCancel = () => {
    setEditingField(null)
    setTempValue('')
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
    const isEmail = editingField === 'email'
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
          <span className="text-title-lg font-semibold text-white">
            {isEmail ? 'Linked Email' : 'Name'}
          </span>
          <button
            onClick={handleSave}
            className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
          >
            <Check size={18} className="text-[#01D6BE]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-6">
          <div className="bg-[#262626] rounded-l overflow-hidden mb-4">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              {isEmail ? (
                <Mail size={16} className="text-[#A0A0A5] flex-shrink-0" />
              ) : (
                <User size={16} className="text-[#A0A0A5] flex-shrink-0" />
              )}
              <input
                type={isEmail ? 'email' : 'text'}
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                placeholder={isEmail ? 'Enter your email' : 'Enter your name'}
                autoFocus
                className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#636366] focus:outline-none"
              />
              {tempValue.length > 0 && (
                <button onClick={() => setTempValue('')}>
                  <X size={16} className="text-[#636366]" />
                </button>
              )}
            </div>
          </div>

          {isEmail && (
            <button
              onClick={handleSave}
              className="w-full h-12 rounded-full bg-[#01D6BE] text-black font-semibold text-body-md"
            >
              Verify New Email
            </button>
          )}
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
          className="p-2 -ml-2 rounded-l hover:bg-[rgba(255,255,255,0.05)] transition-colors"
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
                  className="w-full text-left px-4 py-3 text-body-md text-[#FF3530] hover:bg-white/5 transition-colors"
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
                <User size={40} className="text-[#A0A0A5]" />
              )}
              
              {/* 悬停遮罩 */}
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={24} className="text-white mb-1" />
                <span className="text-xs text-white font-medium">Change Photo</span>
              </div>
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
          
          <p className="text-caption text-[#A0A0A5] mt-3">
            Tap to upload a new photo
          </p>
          {settings.founderBadge && (
            <span className="flex items-center gap-1 text-xs mt-2 px-2 py-0.5 rounded-full 
              bg-[rgba(255,215,0,0.15)] text-[#FFD700] border border-[rgba(255,215,0,0.3)]
              font-semibold">
              <Crown size={10} />
              Founding Member
            </span>
          )}
        </div>

        {/* 编辑表单 */}
        <div className="space-y-4">
          {profileFields.map((field) => {
            const Icon = field.icon
            const isEditing = editingField === field.key
            
            return (
              <div 
                key={field.key}
                className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden"
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className="text-[#A0A0A5]" />
                    <span className="text-caption font-semibold text-[#A0A0A5] uppercase tracking-wide">
                      {field.label}
                    </span>
                  </div>
                  
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        placeholder={field.placeholder}
                        autoFocus
                        className="flex-1 bg-transparent text-[15px] text-[#FFFFFF] placeholder:text-[#636366]
                          focus:outline-none"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleSave}
                          className="p-2 rounded-l bg-[rgba(52,199,89,0.15)] text-[#34C759]"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={handleCancel}
                          className="p-2 rounded-l bg-[rgba(255,59,48,0.15)] text-[#FF3B30]"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={() => handleEdit(field.key, field.value)}
                      className="flex items-center justify-between cursor-pointer group"
                    >
                      <span className="text-[15px] text-[#FFFFFF]">{field.value}</span>
                      <span className="text-caption text-[#01D6BE] opacity-0 group-hover:opacity-100 transition-opacity">
                        Edit
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 提示信息 */}
        <div className="mt-8 p-4 bg-[rgba(1,214,190,0.05)] rounded-l border border-[rgba(1,214,190,0.1)]">
          <p className="text-label text-[#A0A0A5] leading-relaxed">
            Your profile information is stored locally on your device. 
            It will be used to personalize your app experience.
          </p>
        </div>

        {/* PRD v1.1 §4.7: Linked Email OTP Verification */}
        <div className="mt-5">
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Email Verification
          </div>
          <div className="bg-[#262626] rounded-[20px] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-[rgba(1,214,190,0.1)] flex items-center justify-center flex-shrink-0">
                <Mail size={16} className="text-[#01D6BE]" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Linked Email</div>
                <div className="text-caption text-[#A0A0A5]">{profile.email || 'No email linked'}</div>
              </div>
              <button
                onClick={() => {
                  // PRD: 发送 OTP 到邮箱
                  alert('OTP sent to ' + profile.email)
                }}
                className="h-8 px-3 rounded-full bg-[rgba(1,214,190,0.12)] text-[#01D6BE] text-caption font-medium"
              >
                Verify
              </button>
            </div>
          </div>
        </div>

        {/* PRD v1.1 §4.7: Third-Party Accounts */}
        <div className="mt-5">
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
            Linked Accounts
          </div>
          <div className="bg-[#262626] rounded-[20px] overflow-hidden">
            {/* Google */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
              <div className="w-9 h-9 rounded-lg bg-[rgba(234,67,53,0.1)] flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Google</div>
                <div className="text-caption text-[#636366]">Not linked</div>
              </div>
              <button
                onClick={() => {
                  // PRD: Google 登录 / 链接账号
                  alert('Google login not implemented yet')
                }}
                className="h-8 px-3 rounded-full bg-[#333333] text-[#FFFFFF] text-caption font-medium"
              >
                Link
              </button>
            </div>

            {/* Apple */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-[rgba(255,255,255,0.1)] flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#FFFFFF]">Apple</div>
                <div className="text-caption text-[#636366]">Not linked</div>
              </div>
              <button
                onClick={() => {
                  // PRD: Apple 登录 / 链接账号
                  alert('Apple login not implemented yet')
                }}
                className="h-8 px-3 rounded-full bg-[#333333] text-[#FFFFFF] text-caption font-medium"
              >
                Link
              </button>
            </div>
          </div>
        </div>
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
                  <X size={16} className="text-[#A0A0A5]" />
                </button>
              </div>

              {/* Activation Code input */}
              <div className={`rounded-m border px-4 pt-2.5 pb-3 mb-4 ${founderError ? 'border-[#FF3530]' : 'border-[#4A4A4A]'}`}>
                <label className="text-label text-[#A0A0A5]">Activation Code</label>
                <input
                  type="text"
                  value={founderCode}
                  onChange={(e) => { setFounderCode(e.target.value); setFounderError('') }}
                  placeholder="Enter your code"
                  autoFocus
                  className="w-full bg-transparent text-title-md text-white placeholder:text-[#636366] focus:outline-none mt-0.5"
                />
              </div>

              {founderError && (
                <p className="text-body-md text-[#FF3530] mb-3 -mt-1">{founderError}</p>
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
              className="w-full max-w-[340px] bg-[#262626] rounded-[20px] px-6 pt-6 pb-5"
            >
              <h3 className="text-headline-md font-bold text-white text-center mb-2">
                {confirmAction === 'signout' ? 'Sign out?' : 'Delete Account?'}
              </h3>
              <p className="text-body-md text-[#A0A0A5] text-center mb-6 leading-snug">
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
                      : 'bg-[#FF3530] text-white'
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
