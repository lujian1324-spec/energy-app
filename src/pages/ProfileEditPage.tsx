import { motion } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  Camera,
  Check,
  X,
  Crown,
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { saveUserProfile, getUserProfile } from '../db/powerflowDB'
import type { UserProfile } from '../types/protocol'

interface ProfileEditPageProps {
  onBack: () => void
}

export default function ProfileEditPage({ onBack }: ProfileEditPageProps) {
  const { settings } = usePowerStationStore()
  
  // 用户个人信息状态
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Alex Chen',
    email: 'alex.chen@example.com',
    phone: '+1 234 567 8900',
    avatar: null,
    memberSince: '2024-03-15',
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
    { key: 'phone' as const, label: 'Phone Number', icon: Phone, value: profile.phone, placeholder: 'Enter your phone number' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-40 bg-[#000000] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top flex items-center gap-3">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl hover:bg-[rgba(255,255,255,0.05)] transition-colors"
        >
          <ArrowLeft size={24} className="text-[#FFFFFF]" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-[#FFFFFF]">Edit Profile</h2>
          <p className="text-xs text-[#8E8E93]">Manage your personal information</p>
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
              ${settings.founderBadge ? 'bg-[#1C1C1E]' : 'bg-[rgba(1,214,190,0.08)] border-2 border-[rgba(1,214,190,0.3)]'}
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
                <span className="text-[10px] text-white font-medium">Change Photo</span>
              </div>
            </div>
            
            {/* Founder Badge 皇冠图标 */}
            {settings.founderBadge && (
              <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-[#1C1C1E] border-2 border-[#FFD700] flex items-center justify-center z-10">
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
          
          <p className="text-[11px] text-[#8E8E93] mt-3">
            Tap to upload a new photo
          </p>
          {settings.founderBadge && (
            <span className="flex items-center gap-1 text-[10px] mt-2 px-2 py-0.5 rounded-full 
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
                className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] overflow-hidden"
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className="text-[#8E8E93]" />
                    <span className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide">
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
                        className="flex-1 bg-transparent text-[15px] text-[#FFFFFF] placeholder:text-[#48484A]
                          focus:outline-none"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleSave}
                          className="p-2 rounded-xl bg-[rgba(52,199,89,0.15)] text-[#34C759]"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={handleCancel}
                          className="p-2 rounded-xl bg-[rgba(255,59,48,0.15)] text-[#FF3B30]"
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
                      <span className="text-[11px] text-[#01D6BE] opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="mt-8 p-4 bg-[rgba(1,214,190,0.05)] rounded-[16px] border border-[rgba(1,214,190,0.1)]">
          <p className="text-[12px] text-[#8E8E93] leading-relaxed">
            Your profile information is stored locally on your device. 
            It will be used to personalize your app experience.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
