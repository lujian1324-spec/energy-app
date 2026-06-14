import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, X, Check, Loader2 } from 'lucide-react'
import { registerByEmail, sendEmailCaptcha } from '../api/authApi'
import { useAuthStore } from '../stores/authStore'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const ACCOUNT_RE = /^[a-zA-Z0-9_]+$/

export default function RegisterPage() {
  const navigate = useNavigate()

  const [account, setAccount] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agreed, setAgreed] = useState(false)

  const [captchaId, setCaptchaId] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // ── Validation ──
  const accountValid = account.trim().length > 0 && ACCOUNT_RE.test(account.trim())
  const emailValid = isValidEmail(email.trim())
  const passwordValid = password.length >= 6 && password.length <= 32
  const confirmValid = confirm.length > 0 && confirm === password
  const codeValid = code.trim().length === 6
  const canSubmit = accountValid && emailValid && codeValid && passwordValid && confirmValid && agreed

  const handleObtainCode = async () => {
    if (countdown > 0) return
    if (!emailValid) { setError('Please enter a valid email address.'); return }
    setError('')
    setSending(true)
    try {
      const result = await sendEmailCaptcha(email.trim(), '1')
      if (result.code === 0 || result.code === '0') {
        setCaptchaId(result.data?.iotCaptchaId ?? null)
        setCountdown(60)
      } else {
        setError(result.message || result.msg || 'Failed to send code.')
      }
    } catch {
      setError('Failed to send code. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleRegister = async () => {
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      const result = await registerByEmail(
        account.trim(),
        password,
        email.trim(),
        code.trim(),
        captchaId || undefined
      )
      if (result.code === 0 || result.code === '0') {
        const loggedIn = await useAuthStore.getState().login(account.trim(), password)
        if (loggedIn) {
          navigate('/onboarding', { replace: true })
        } else {
          navigate('/login', { replace: true })
        }
      } else {
        setError(result.message ?? result.msg ?? 'Registration failed. Please try again.')
      }
    } catch {
      setError('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // 注册成功
  if (success) {
    return (
      <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center px-6">
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
          <p className="text-[13px] text-[#A0A0A5] text-center max-w-[260px]">
            Your account has been created. You can now sign in with your credentials.
          </p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-8 py-3 rounded-l font-semibold text-body-md
              bg-[#01D6BE] text-[#000000] active:scale-[0.98] transition-all"
          >
            Go to Sign In
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-ink-12">
      <div className="px-4 pt-5 safe-area-top">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 active:scale-95 transition-transform"
        >
          <ChevronLeft size={22} />
        </button>
      </div>

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-headline-lg-em font-bold text-[#FFFFFF]">Create Account</h1>
        <p className="text-[13px] text-[#A0A0A5] mt-1">Sign up to start managing your devices</p>
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
          <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
            <User size={12} />
            Account Name
          </label>
          <input
            type="text"
            value={account}
            onChange={e => { setAccount(e.target.value); clearError() }}
            placeholder="Choose an account name"
            autoComplete="username"
            className="w-full px-4 py-3 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
              text-[#FFFFFF] text-body-md placeholder:text-[#636366]
              focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
          />
          {account && (
            <button onClick={() => setAccount('')} aria-label="Clear account">
              <X size={16} className="text-ink-7" />
            </button>
          )}
        </div>

        {/* 邮箱地址 */}
        <div>
          <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
            <Mail size={12} />
            Email Address
          </label>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={e => { setEmail(e.target.value); clearError() }}
            placeholder="Enter your email"
            autoComplete="email"
            className="w-full px-4 py-3 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
              text-[#FFFFFF] text-body-md placeholder:text-[#636366]
              focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
          />
        </div>

        {/* 验证码 */}
        <div>
          <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
            Verification Code
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={captcha}
              onChange={e => { setCaptcha(e.target.value); clearError() }}
              placeholder="Enter verification code"
              maxLength={6}
              className="flex-1 px-4 py-3 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
                text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
            />
            <button
              type="button"
              onClick={handleSendCaptcha}
              disabled={captchaCooldown > 0 || !email.trim()}
              className="px-4 py-3 rounded-l text-[13px] font-medium whitespace-nowrap
                bg-[rgba(1,214,190,0.12)] text-[#01D6BE] border border-[rgba(1,214,190,0.2)]
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {captchaCooldown > 0 ? `${captchaCooldown}s` : captchaSent ? 'Resend' : 'Send Code'}
            </button>
          )}
        </div>

        {/* 密码 */}
        <div>
          <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
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
              className="w-full px-4 py-3 pr-11 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
                text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#636366] hover:text-[#A0A0A5]"
            >
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* 确认密码 */}
        <div>
          <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
            <Lock size={12} />
            Confirm Password
          </label>
          <input
            type={showPwd ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); clearError() }}
            placeholder="Confirm your password"
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
              text-[#FFFFFF] text-body-md placeholder:text-[#636366]
              focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
          />
          <button
            onClick={handleObtainCode}
            disabled={countdown > 0 || sending || !emailValid}
            className="shrink-0 text-label font-semibold text-primary disabled:text-ink-7 transition-colors flex items-center gap-1"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : null}
            {countdown > 0 ? `Resend (${countdown})` : 'Obtain Verification Code'}
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-l
              bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.2)]"
          >
            <AlertCircle size={14} className="text-[#FF3B30] flex-shrink-0" />
            <p className="text-label text-[#FF3B30]">{error}</p>
          </motion.div>
        )}
        {(password.length === 0 || passwordValid) && <div className="mb-3" />}

        {/* Terms & Privacy */}
        <p className="text-caption leading-relaxed text-center text-[#A0A0A5] px-4">
          By creating an account, you agree to our{' '}
          <Link
            to="/terms"
            className="text-[#01D6BE] underline underline-offset-2 hover:text-[#14B8A6] transition-colors"
          >
            Terms of Use
          </Link>
          {' '}and{' '}
          <Link
            to="/privacy"
            className="text-[#01D6BE] underline underline-offset-2 hover:text-[#14B8A6] transition-colors"
          >
            Privacy Policy
          </Link>
        </p>

        {/* User Service Agreement */}
        <button
          type="submit"
          disabled={loading || !account.trim() || !password.trim()}
          className="w-full py-3.5 rounded-l font-semibold text-body-md
            bg-[#01D6BE] text-[#000000]
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Register'}
        </button>

        <p className="text-body-md text-ink-7 mt-4 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-semibold">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
