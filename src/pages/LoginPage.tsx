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
  const [tab, setTab] = useState<Tab>('username')
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
      // Email-code login reuses the REGISTER captcha intent ('1'); the backend
      // does not issue a separate login captcha for /login/email, so intent '3'
      // returned a code that /login/email would not accept.
      const result = await sendEmailCaptcha(email.trim(), '1')
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
    <div className="min-h-screen bg-ink-12 flex flex-col px-6 safe-area-top safe-area-bottom">
      <div className="flex-1 flex flex-col justify-center">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-2">
            <svg viewBox="0 0 320 56" className="w-4/5 max-w-[280px] h-auto" xmlns="http://www.w3.org/2000/svg">
              <text
                x="50%"
                y="44"
                textAnchor="middle"
                fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
                fontSize="52"
                fontWeight="700"
                letterSpacing="12"
                fill="white"
              >SIERRO</text>
            </svg>
          </div>
          <p className="text-body-md text-ink-7 mt-2"></p>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-ink-9 mb-6">
          {(['username', 'email'] as Tab[]).map(t => (
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
          <>
            <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-1 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
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
            {email && !emailValid && (
              <p className="text-caption text-danger mb-2 px-1">Please enter a valid email address.</p>
            )}
            {(!email || emailValid) && <div className="mb-2" />}
          </>
        ) : (
          <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-3 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
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
          <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-3 mb-3 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
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
          <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-3 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
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

        {/* ── With Verification Code toggle (email tab only) ── */}
        {tab === 'email' && (
          <div className="flex items-center justify-between py-1 mb-1">
            <span className="text-body-md text-ink-7">With Verification Code</span>
            <button
              onClick={toggleOtpMode}
              role="switch"
              aria-checked={otpMode}
              aria-label="With Verification Code"
              className={`relative w-12 h-7 rounded-pill transition-colors duration-300
                ${otpMode ? 'bg-primary' : 'bg-ink-9'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-ink-1 transition-transform duration-300
                  ${otpMode ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        )}

        {/* Forgot password */}
        {!otpMode && (
          <div className="flex justify-end mt-1">
            <Link to="/forgot-password" className="text-body-md text-primary">
              Forgot password?
            </Link>
          </div>
        )}

        {error && <p className="text-label text-danger mt-2">{error}</p>}

        {/* Sign In */}
        <button
          onClick={handleSignIn}
          disabled={signInDisabled || busy || loading}
          className="w-full py-4 mt-6 rounded-m font-semibold text-title-md text-ink-13
            bg-primary disabled:bg-primary-dark disabled:text-ink-13/60 disabled:cursor-not-allowed
            active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : 'Sign In'}
        </button>

        {/* Sign up + Guest */}
        <div className="text-center mt-5 space-y-3">
          <p className="text-body-md text-ink-7">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary font-semibold">Sign up</Link>
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
