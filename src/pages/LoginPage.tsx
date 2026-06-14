import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { sendEmailCaptcha, loginByEmail } from '../api/authApi'

type Tab = 'email' | 'username'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const { loading, isAuthenticated, login } = useAuthStore()
  const navigate = useNavigate()

  // ── Tab + shared fields ──
  const [tab, setTab] = useState<Tab>('email')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // ── Verification-code (OTP) mode ──
  const [otpMode, setOtpMode] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [captchaId, setCaptchaId] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Status ──
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())

  // ── redirect on auth ──
  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  // ── cleanup cooldown ──
  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [])

  const startCooldown = () => {
    setCooldown(60)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    setError(null)
    // Username tab can't use verification-code login
    if (next === 'username') setOtpMode(false)
  }

  const toggleOtpMode = () => {
    setOtpMode(v => !v)
    setError(null)
    setOtpSent(false)
    setOtpCode('')
    setCaptchaId(null)
  }

  // ── Obtain verification code (email OTP) ──
  const handleObtainCode = async () => {
    if (cooldown > 0 || !emailValid) { setError('Please enter a valid email address.'); return }
    setError(null)
    setSending(true)
    try {
      const result = await sendEmailCaptcha(email.trim(), '3')
      if (result.code === 0 || result.code === '0') {
        setCaptchaId(result.data?.iotCaptchaId ?? null)
        setOtpSent(true)
        startCooldown()
      } else {
        setError(result.message || result.msg || 'Failed to send code.')
      }
    } catch {
      setError('Failed to send verification code. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // ── Sign in ──
  const handleSignIn = async () => {
    setError(null)

    // Email + verification-code login
    if (tab === 'email' && otpMode) {
      if (!captchaId || otpCode.trim().length < 6 || !email.trim()) return
      setBusy(true)
      try {
        const result = await loginByEmail(email.trim(), captchaId, otpCode.trim())
        if (result.code === 0 || result.code === '0') {
          useAuthStore.setState({ isAuthenticated: true, isGuest: false, user: result.data ?? null })
          navigate('/', { replace: true })
        } else {
          setError(result.message || result.msg || 'Invalid verification code.')
        }
      } catch {
        setError('Invalid verification code.')
      } finally {
        setBusy(false)
      }
      return
    }

    // Password login (email or username)
    const account = tab === 'email' ? email.trim() : username.trim()
    if (!account || !password) return
    setBusy(true)
    try {
      const ok = await login(account, password)
      if (ok) {
        navigate('/', { replace: true })
      } else {
        setError(useAuthStore.getState().error || 'Invalid credentials.')
      }
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── Sign-in button disabled state ──
  const signInDisabled = (() => {
    if (tab === 'email' && otpMode) return !captchaId || otpCode.length < 6
    const account = tab === 'email' ? email.trim() : username.trim()
    return !account || !password
  })()

  return (
    <div className="min-h-screen bg-ink-12 flex flex-col px-6">
      <div className="flex-1 flex flex-col justify-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 flex flex-col items-center gap-3"
        >
          <div className="w-16 h-16 rounded-[22px] bg-[rgba(1,214,190,0.12)] border border-[rgba(1,214,190,0.3)]
            flex items-center justify-center">
            <Zap size={32} className="text-[#01D6BE]" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#FFFFFF]">Sierro</h1>
            <p className="text-label text-[#A0A0A5] mt-1">Smart Energy Management</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {emailFlow ? (
            // ═══════════════════════════════════════
            //  Email Login Flow
            // ═══════════════════════════════════════
            <motion.div
              key="email-flow"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-sm mx-auto"
            >
              {/* Back button */}
              <button
                onClick={resetEmailFlow}
                className="flex items-center gap-1.5 text-[13px] text-[#A0A0A5] hover:text-[#FFFFFF] mb-5 transition-colors"
              >
                <ArrowLeft size={14} />
                <span>Back to sign in</span>
              </button>

              {/* Heading */}
              <h2 className="text-title-lg font-bold text-[#FFFFFF] mb-1">Email Sign In</h2>
              <p className="text-[13px] text-[#A0A0A5] mb-5">Enter your email to receive a verification code</p>

              {/* Email input */}
              <div className="mb-3">
                <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
                  <Mail size={12} />
                  Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(null) }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    className="flex-1 px-4 py-3 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
                      text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                      focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
                  />
                  <button
                    onClick={handleSendEmailCode}
                    disabled={emailSending || emailCooldown > 0 || !email.trim()}
                    className="px-4 py-3 rounded-l text-[13px] font-semibold whitespace-nowrap
                      bg-[#01D6BE] text-[#000000]
                      disabled:opacity-40 disabled:cursor-not-allowed
                      active:scale-[0.97] transition-all min-w-[80px]"
                  >
                    {emailSending ? (
                      <Loader2 size={14} className="animate-spin mx-auto" />
                    ) : emailCooldown > 0 ? (
                      `${emailCooldown}s`
                    ) : (
                      'Send Code'
                    )}
                  </button>
                </div>
              </div>

              {/* Verification code input */}
              <div className="mb-4">
                <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
                  <Lock size={12} />
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={emailCode}
                  onChange={e => { setEmailCode(e.target.value.replace(/\D/g, '')); setEmailError(null) }}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="w-full px-4 py-3 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
                    text-[#FFFFFF] text-body-md placeholder:text-[#636366] tracking-[0.3em] text-center
                    focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
                />
              </div>

              {/* Error */}
              <AnimatePresence>
                {emailError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-label text-[#FF3B30] text-center mb-3"
                  >
                    {emailError}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Sign In with Email button */}
              <button
                onClick={handleEmailLogin}
                disabled={emailLoggingIn || !emailIotCaptchaId || !emailCode.trim()}
                className="w-full py-3.5 rounded-l font-semibold text-body-md
                  bg-[#01D6BE] text-[#000000]
                  disabled:opacity-40 disabled:cursor-not-allowed
                  active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {emailLoggingIn ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <Mail size={16} />
                    <span>Sign In with Email</span>
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            // ═══════════════════════════════════════
            //  Main Login (Account/Password)
            // ═══════════════════════════════════════
            <motion.div
              key="main-login"
              initial={{ opacity: 0, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-sm mx-auto"
            >
              {/* Heading */}
              <div className="text-center mb-6">
                <h2 className="text-title-lg font-bold text-[#FFFFFF] mb-1">Welcome</h2>
                <p className="text-[13px] text-[#A0A0A5]">Sign in to manage your devices</p>
              </div>

              {/* Account Login Form */}
              <form onSubmit={handleLogin} className="space-y-3">
                {/* Account input */}
                <div>
                  <label className="text-caption font-semibold text-[#A0A0A5] mb-1.5 flex items-center gap-1.5">
                    <User size={12} />
                    Account
                  </label>
                  <input
                    type="text"
                    value={account}
                    onChange={e => { setAccount(e.target.value); clearError() }}
                    placeholder="Username or email"
                    autoComplete="username"
                    className="w-full px-4 py-3 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.15)]
                      text-[#FFFFFF] text-body-md placeholder:text-[#636366]
                      focus:outline-none focus:border-[rgba(1,214,190,0.5)] transition-colors"
                  />
                </div>

                {/* Password input */}
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
                      placeholder="Enter your password"
                      autoComplete="current-password"
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

                {/* Error display */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-label text-[#FF3B30] text-center py-1"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Sign In button */}
                <button
                  type="submit"
                  disabled={loading || !account.trim() || !password.trim()}
                  className="w-full py-3.5 rounded-l font-semibold text-body-md
                    bg-[#01D6BE] text-[#000000]
                    disabled:opacity-40 disabled:cursor-not-allowed
                    active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              {/* Email Login */}
              <div className="mt-6">
                <button
                  onClick={() => setEmailFlow(true)}
                  disabled={loading}
                  className="w-full py-3.5 rounded-l bg-[#262626] border border-[rgba(1,214,190,0.12)] text-[#FFFFFF] text-body-md font-medium
                    flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
                >
                  <Mail size={18} className="text-[#01D6BE]" />
                  Sign In with Email Code
                </button>
              </div>

              {/* PRD v1.1 §4.8: Social Login */}
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#333333]" />
                  <span className="text-caption text-[#636366]">or</span>
                  <div className="flex-1 h-px bg-[#333333]" />
                </div>
                {/* Google Login */}
                <button
                  onClick={() => {
                    // PRD: Google 登录
                    alert('Google login not implemented yet')
                  }}
                  className="w-full py-3.5 rounded-l bg-[#262626] border border-[rgba(255,255,255,0.1)] text-[#FFFFFF] text-body-md font-medium
                    flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
                {/* Apple Login */}
                <button
                  onClick={() => {
                    // PRD: Apple 登录
                    alert('Apple login not implemented yet')
                  }}
                  className="w-full py-3.5 rounded-l bg-[#262626] border border-[rgba(255,255,255,0.1)] text-[#FFFFFF] text-body-md font-medium
                    flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Continue with Apple
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom section — only on main login view */}
      {!emailFlow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="pb-10 pt-4 text-center space-y-4"
        >
          {/* Sign Up link */}
          <button
            onClick={() => navigate('/register')}
            className="text-body-md text-[#01D6BE] font-medium
              flex items-center justify-center gap-1 mx-auto hover:opacity-80 transition-opacity"
          >
            <span>Don&apos;t have an account?</span>
            <span className="underline">Sign Up</span>
            <ChevronRight size={14} />
          </button>

          {/* Continue as Guest */}
          <div>
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 pb-3 text-title-md font-semibold transition-colors relative
                ${tab === t ? 'text-ink-1' : 'text-ink-7'}`}
            >
              {t === 'email' ? 'Email' : 'Username'}
              {tab === t && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary rounded-pill" />
              )}
            </button>
          ))}
        </div>

        {/* ── Identifier field ── */}
        {tab === 'email' ? (
          <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-3">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null) }}
              placeholder="Email address"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
            />
            {email && (
              <button onClick={() => setEmail('')} aria-label="Clear email">
                <X size={16} className="text-ink-7" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-3">
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(null) }}
              placeholder="Username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
            />
            {username && (
              <button onClick={() => setUsername('')} aria-label="Clear username">
                <X size={16} className="text-ink-7" />
              </button>
            )}
          </div>
        )}

        {/* ── Password OR verification-code field ── */}
        {tab === 'email' && otpMode ? (
          <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-3 mb-3">
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
              placeholder="Verification code"
              autoComplete="one-time-code"
              maxLength={6}
              className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
            />
            <button
              onClick={handleObtainCode}
              disabled={cooldown > 0 || sending || !emailValid}
              className="shrink-0 text-label font-semibold text-primary disabled:text-ink-7 transition-colors
                flex items-center gap-1"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : null}
              {cooldown > 0 ? `Resend (${cooldown})` : otpSent ? 'Resend Code' : 'Obtain Code'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-3">
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null) }}
              placeholder="Password"
              autoComplete="current-password"
              onKeyDown={e => { if (e.key === 'Enter') handleSignIn() }}
              className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
            />
          </div>
        )}

          {/* Terms & Privacy */}
          <p className="text-caption leading-relaxed text-[#A0A0A5]">
            By continuing, you agree to our{' '}
            <Link to="/terms" className="text-[#01D6BE] underline underline-offset-2 hover:text-[#14B8A6] transition-colors">
              Terms of Use
            </Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-[#01D6BE] underline underline-offset-2 hover:text-[#14B8A6] transition-colors">
              Privacy Policy
            </Link>
          </p>
          <button
            onClick={() => {
              useAuthStore.getState().setGuestMode()
              navigate('/', { replace: true })
            }}
            disabled={loading}
            className="text-body-md text-ink-7 hover:text-ink-1 transition-colors"
          >
            Continue as Guest
          </button>
        </div>
      </div>

      {/* Terms & Privacy */}
      <p className="pb-8 pt-4 text-center text-caption leading-relaxed text-ink-7">
        By continuing, you agree to our{' '}
        <Link to="/terms" className="text-primary underline underline-offset-2">Terms of Use</Link>
        {' '}and{' '}
        <Link to="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</Link>
      </p>
    </div>
  )
}
