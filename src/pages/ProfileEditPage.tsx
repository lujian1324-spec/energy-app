import { motion } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  User,
  Mail,
  Camera,
  Check,
  X,
  Crown,
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
  const { user: authUser } = useAuthStore()

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
  
  const profileFields = [
    { key: 'name' as const, label: 'Full Name', icon: User, value: profile.name, placeholder: 'Enter your name' },
    { key: 'email' as const, label: 'Email Address', icon: Mail, value: profile.email, placeholder: 'Enter your email' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-40 bg-[#141414] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top flex items-center gap-3">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-l hover:bg-[rgba(255,255,255,0.05)] transition-colors"
        >
          <ArrowLeft size={24} className="text-[#FFFFFF]" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-[#FFFFFF]">Edit Profile</h2>
          <p className="text-xs text-[#A0A0A5]">Manage your personal information</p>
        </div>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-6">
        {/* 头像上传区域 */}
        <div className="flex flex-col items-center py-8">
          <div 
            onClick={handleAvatarClick}
            className={`relative cursor-pointer group ${settings.founderBadge ? 'p-1' : ''}`}
          >
            {/* Founder Badge 金边 */}
            {settings.founderBadge && (
              <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FFD700]" />
            )}
            
            {/* 头像容器 */}
            <div className={`relative w-28 h-28 rounded-[28px] overflow-hidden
              ${settings.founderBadge ? 'bg-[#262626]' : 'bg-[rgba(1,214,190,0.08)] border-2 border-[rgba(1,214,190,0.3)]'}
              flex items-center justify-center`}
            >
              {profile.avatar ? (
                <img 
                  src={profile.avatar} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={48} className={settings.founderBadge ? 'text-[#FFD700]' : 'text-[#01D6BE]'} />
              )}
              
              {/* 悬停遮罩 */}
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={24} className="text-white mb-1" />
                <span className="text-xs text-white font-medium">Change Photo</span>
              </div>
            </div>
            
            {/* Founder Badge 皇冠图标 */}
            {settings.founderBadge && (
              <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-[#262626] border-2 border-[#FFD700] flex items-center justify-center z-10">
                <Crown size={16} className="text-[#FFD700]" />
              </div>
            )}
          </div>
          
          {/* 隐藏的文件输入 */}
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
    </motion.div>
  )
}
