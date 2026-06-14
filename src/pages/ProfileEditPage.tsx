import { motion } from 'framer-motion'
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
import type { UserProfile } from '../types/protocol'

interface ProfileEditPageProps {
  onBack: () => void
}

export default function ProfileEditPage({ onBack }: ProfileEditPageProps) {
  const { settings } = usePowerStationStore()
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

  const handleSignOut = () => {
    setShowMenu(false)
    if (typeof logout === 'function') {
      logout()
    }
    onBack()
  }

  const handleDeleteAccount = () => {
    setShowMenu(false)
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      if (typeof logout === 'function') {
        logout()
      }
      onBack()
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
            <div className="w-24 h-24 rounded-full border-2 border-[#01D6BE] overflow-hidden bg-[#262626] flex items-center justify-center">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={40} className="text-[#A0A0A5]" />
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
              👑 Founding Member #42
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
            <User size={18} className="text-[#A0A0A5] flex-shrink-0" />
            <span className="text-body-md text-white flex-1">Name</span>
            <span className="text-body-md text-[#A0A0A5] truncate max-w-[140px]">{profile.name}</span>
            <ChevronRight size={16} className="text-[#636366] flex-shrink-0" />
          </button>

          {/* Linked Email row */}
          <button
            onClick={() => handleEdit('email', profile.email)}
            className="w-full flex items-center gap-3 px-4 py-4 text-left"
          >
            <Mail size={18} className="text-[#A0A0A5] flex-shrink-0" />
            <span className="text-body-md text-white flex-1">Linked Email</span>
            <span className="text-body-md text-[#A0A0A5] truncate max-w-[140px]">{profile.email}</span>
            <ChevronRight size={16} className="text-[#636366] flex-shrink-0" />
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
            <span className="text-body-md text-[#A0A0A5] mr-2">Not linked</span>
            <button
              onClick={() => alert('Google login not implemented yet')}
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
            <span className="text-body-md text-[#A0A0A5] mr-2">Not linked</span>
            <button
              onClick={() => alert('Apple login not implemented yet')}
              className="h-8 px-4 rounded-full border border-[#01D6BE] text-[#01D6BE] text-label font-semibold"
            >
              Link
            </button>
          </div>
        </div>

        {/* Footer: founder code */}
        <p className="mt-6 text-center text-caption text-[#A0A0A5]">
          Have a founder code?{' '}
          <button className="text-[#01D6BE] underline text-caption">
            Redeem founder badge
          </button>
        </p>
      </div>
    </motion.div>
  )
}
