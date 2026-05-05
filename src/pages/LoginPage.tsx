import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, User, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function LoginPage() {
  const { login, loading, error, clearError } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    await login(username.trim(), password.trim())
  }

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 flex flex-col items-center gap-4"
      >
        <div className="w-20 h-20 rounded-[28px] bg-[rgba(1,214,190,0.12)] border border-[rgba(1,214,190,0.3)]
          flex items-center justify-center">
          <Zap size={40} className="text-[#01D6BE]" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#FFFFFF]">Sierro</h1>
          <p className="text-[13px] text-[#8E8E93] mt-1">四色光伏开放平台</p>
        </div>
      </motion.div>

      {/* 登录卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="w-full max-w-sm bg-[#1C1C1E] border border-[rgba(1,214,190,0.12)] rounded-[28px] p-6"
      >
        <h2 className="text-[18px] font-bold text-[#FFFFFF] mb-1">登录账号</h2>
        <p className="text-[12px] text-[#8E8E93] mb-6">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 账号输入 */}
          <div>
            <label className="text-[11px] font-semibold text-[#8E8E93] mb-1.5 flex items-center gap-1.5">
              <User size={12} />
              账号
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); clearError() }}
                placeholder="请输入账号"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl bg-[#000000] border border-[rgba(1,214,190,0.15)]
                  text-[#FFFFFF] text-[14px] placeholder:text-[#48484A]
                  focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
              />
            </div>
          </div>

          {/* 密码输入 */}
          <div>
            <label className="text-[11px] font-semibold text-[#8E8E93] mb-1.5 flex items-center gap-1.5">
              <Lock size={12} />
              密码
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); clearError() }}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-11 rounded-xl bg-[#000000] border border-[rgba(1,214,190,0.15)]
                  text-[#FFFFFF] text-[14px] placeholder:text-[#48484A]
                  focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#48484A] hover:text-[#8E8E93]"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl
                bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.2)]"
            >
              <AlertCircle size={14} className="text-[#FF3B30] flex-shrink-0" />
              <span className="text-[12px] text-[#FF3B30]">{error}</span>
            </motion.div>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full py-3.5 rounded-xl font-semibold text-[14px]
              bg-[#01D6BE] text-[#000000]
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>登录中...</span>
              </>
            ) : (
              '登 录'
            )}
          </button>
        </form>

        {/* 签名说明 */}
        <div className="mt-5 pt-4 border-t border-[rgba(1,214,190,0.08)]">
          <p className="text-[10px] text-[#48484A] text-center leading-relaxed">
            接口签名已启用 · IOT-Open-Sign 验证
            <br />
            AppID: rYGQpmYU5k
          </p>
        </div>
      </motion.div>
    </div>
  )
}
