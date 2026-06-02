import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, User, Lock, Mail, Eye, EyeOff, AlertCircle, Loader2, ArrowLeft } from 'lucide-react'
import { registerByEmail, sendEmailCaptcha } from '../api/authApi'

export default function RegisterPage() {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [captchaId, setCaptchaId] = useState<string | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [captchaSent, setCaptchaSent] = useState(false)
  const [captchaCooldown, setCaptchaCooldown] = useState(0)

  const clearError = () => setError(null)

  // 发送验证码（仅邮箱）
  const handleSendCaptcha = async () => {
    if (captchaCooldown > 0) return
    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }

    try {
      const result = await sendEmailCaptcha(email.trim(), '1')
      const cid = result.data?.iotCaptchaId
      if (cid) {
        setCaptchaId(cid)
      }
      setCaptchaSent(true)
      setCaptchaCooldown(60)
      const timer = setInterval(() => {
        setCaptchaCooldown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setError('Failed to send verification code. Please try again.')
      console.error('[RegisterPage] sendCaptcha failed:', err)
    }
  }

  // 注册提交（仅邮箱）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (!account.trim()) { setError('Please enter an account name'); return }
    if (account.trim().length < 3) { setError('Account must be at least 3 characters'); return }
    if (!password.trim()) { setError('Please enter a password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (!email.trim()) { setError('Please enter your email'); return }

    setLoading(true)
    try {
      const result = await registerByEmail(
        account.trim(),
        password,
        email.trim(),
        captcha || undefined,
        captchaId || undefined
      )
      if (result.code === 0 || result.code === '0') {
        setSuccess(true)
      } else {
        setError(result.message ?? result.msg ?? 'Registration failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  // 注册成功
  if (success) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-20 h-20 rounded-full bg-[rgba(52,199,89,0.12)] border border-[rgba(52,199,89,0.3)]
            flex items-center justify-center">
            <Zap size={36} className="text-[#34C759]" />
          </div>
          <h2 className="text-xl font-bold text-[#FFFFFF]">Registration Successful!</h2>
          <p className="text-[13px] text-[#8E8E93] text-center max-w-[260px]">
            Your account has been created. You can now sign in with your credentials.
          </p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-8 py-3 rounded-xl font-semibold text-[14px]
              bg-[#0D9488] text-[#000000] active:scale-[0.98] transition-all"
          >
            Go to Sign In
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col px-6 pt-14">
      {/* 返回按钮 */}
      <button
        onClick={() => window.history.back()}
        className="self-start mb-6 p-2 -ml-2 text-[#8E8E93] active:text-[#FFFFFF]"
      >
        <ArrowLeft size={22} />
      </button>

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-[26px] font-bold text-[#FFFFFF]">Create Account</h1>
        <p className="text-[13px] text-[#8E8E93] mt-1">Sign up to start managing your devices</p>
      </motion.div>

      {/* 表单 */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* 账号 */}
        <div>
          <label className="text-[11px] font-semibold text-[#8E8E93] mb-1.5 flex items-center gap-1.5">
            <User size={12} />
            Account Name
          </label>
          <input
            type="text"
            value={account}
            onChange={e => { setAccount(e.target.value); clearError() }}
            placeholder="Choose an account name"
            autoComplete="username"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C1E] border border-[rgba(13,148,136,0.15)]
              text-[#FFFFFF] text-[14px] placeholder:text-[#48484A]
              focus:outline-none focus:border-[rgba(13,148,136,0.5)] transition-colors"
          />
        </div>

        {/* 邮箱地址 */}
        <div>
          <label className="text-[11px] font-semibold text-[#8E8E93] mb-1.5 flex items-center gap-1.5">
            <Mail size={12} />
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); clearError() }}
            placeholder="Enter your email"
            autoComplete="email"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C1E] border border-[rgba(13,148,136,0.15)]
              text-[#FFFFFF] text-[14px] placeholder:text-[#48484A]
              focus:outline-none focus:border-[rgba(13,148,136,0.5)] transition-colors"
          />
        </div>

        {/* 验证码 */}
        <div>
          <label className="text-[11px] font-semibold text-[#8E8E93] mb-1.5 flex items-center gap-1.5">
            Verification Code
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={captcha}
              onChange={e => { setCaptcha(e.target.value); clearError() }}
              placeholder="Enter verification code"
              maxLength={6}
              className="flex-1 px-4 py-3 rounded-xl bg-[#1C1C1E] border border-[rgba(13,148,136,0.15)]
                text-[#FFFFFF] text-[14px] placeholder:text-[#48484A]
                focus:outline-none focus:border-[rgba(13,148,136,0.5)] transition-colors"
            />
            <button
              type="button"
              onClick={handleSendCaptcha}
              disabled={captchaCooldown > 0 || !email.trim()}
              className="px-4 py-3 rounded-xl text-[13px] font-medium whitespace-nowrap
                bg-[rgba(13,148,136,0.12)] text-[#0D9488] border border-[rgba(13,148,136,0.2)]
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {captchaCooldown > 0 ? `${captchaCooldown}s` : captchaSent ? 'Resend' : 'Send Code'}
            </button>
          </div>
        </div>

        {/* 密码 */}
        <div>
          <label className="text-[11px] font-semibold text-[#8E8E93] mb-1.5 flex items-center gap-1.5">
            <Lock size={12} />
            Password
          </label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); clearError() }}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="w-full px-4 py-3 pr-11 rounded-xl bg-[#1C1C1E] border border-[rgba(13,148,136,0.15)]
                text-[#FFFFFF] text-[14px] placeholder:text-[#48484A]
                focus:outline-none focus:border-[rgba(13,148,136,0.5)] transition-colors"
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

        {/* 确认密码 */}
        <div>
          <label className="text-[11px] font-semibold text-[#8E8E93] mb-1.5 flex items-center gap-1.5">
            <Lock size={12} />
            Confirm Password
          </label>
          <input
            type={showPwd ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); clearError() }}
            placeholder="Confirm your password"
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C1E] border border-[rgba(13,148,136,0.15)]
              text-[#FFFFFF] text-[14px] placeholder:text-[#48484A]
              focus:outline-none focus:border-[rgba(13,148,136,0.5)] transition-colors"
          />
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
            <p className="text-[12px] text-[#FF3B30]">{error}</p>
          </motion.div>
        )}

        {/* Terms & Privacy */}
        <p className="text-[11px] leading-relaxed text-center text-[#8E8E93] px-4">
          By creating an account, you agree to our{' '}
          <Link
            to="/terms"
            className="text-[#0D9488] underline underline-offset-2 hover:text-[#14B8A6] transition-colors"
          >
            Terms of Use
          </Link>
          {' '}and{' '}
          <Link
            to="/privacy"
            className="text-[#0D9488] underline underline-offset-2 hover:text-[#14B8A6] transition-colors"
          >
            Privacy Policy
          </Link>
        </p>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading || !account.trim() || !password.trim()}
          className="w-full py-3.5 rounded-xl font-semibold text-[14px]
            bg-[#0D9488] text-[#000000]
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </motion.form>
    </div>
  )
}