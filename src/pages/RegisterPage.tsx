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

      <div className="flex-1 px-6 pt-6">
        <h1 className="font-display text-headline-lg text-ink-1 mb-1">Create Account</h1>
        <p className="text-body-md text-ink-7 mb-8">Sign up to get started with Sierro.</p>

        {/* Account */}
        <label className="block text-label text-ink-7 mb-1.5">Account</label>
        <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-4">
          <input
            type="text"
            value={account}
            onChange={e => { setAccount(e.target.value); setError('') }}
            placeholder="Choose a username"
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
          />
          {account && (
            <button onClick={() => setAccount('')} aria-label="Clear account">
              <X size={16} className="text-ink-7" />
            </button>
          )}
        </div>

        {/* Email */}
        <label className="block text-label text-ink-7 mb-1.5">Email</label>
        <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-4">
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            placeholder="Email address"
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

        {/* Verification Code */}
        <label className="block text-label text-ink-7 mb-1.5">Verification Code</label>
        <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-3 mb-4">
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
            placeholder="6-digit code"
            autoComplete="one-time-code"
            maxLength={6}
            className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
          />
          <button
            onClick={handleObtainCode}
            disabled={countdown > 0 || sending || !emailValid}
            className="shrink-0 text-label font-semibold text-primary disabled:text-ink-7 transition-colors flex items-center gap-1"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : null}
            {countdown > 0 ? `Resend (${countdown})` : 'Obtain Code'}
          </button>
        </div>

        {/* Password */}
        <label className="block text-label text-ink-7 mb-1.5">Password</label>
        <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-1">
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="6–32 characters, case sensitive"
            className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
          />
        </div>
        {password.length > 0 && !passwordValid && (
          <p className="text-label text-danger mb-3">Password must be 6–32 characters.</p>
        )}
        {(password.length === 0 || passwordValid) && <div className="mb-3" />}

        {/* Confirm Password */}
        <label className="block text-label text-ink-7 mb-1.5">Confirm Password</label>
        <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-1">
          <input
            type="password"
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setError('') }}
            placeholder="Re-enter your password"
            onKeyDown={e => { if (e.key === 'Enter') handleRegister() }}
            className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
          />
        </div>
        {confirm.length > 0 && confirm !== password && (
          <p className="text-label text-danger mb-3">Passwords do not match.</p>
        )}
        {(confirm.length === 0 || confirm === password) && <div className="mb-3" />}

        {/* User Service Agreement */}
        <button
          onClick={() => setAgreed(v => !v)}
          className="flex items-start gap-3 text-left w-full mt-1"
        >
          <span
            className={`shrink-0 mt-0.5 w-5 h-5 rounded-s flex items-center justify-center border-s transition-colors
              ${agreed ? 'bg-primary border-primary' : 'bg-transparent border-ink-7'}`}
          >
            {agreed && <Check size={14} className="text-ink-13" />}
          </span>
          <span className="text-label text-ink-7 leading-relaxed">
            I have read and agree to the{' '}
            <Link to="/terms" className="text-primary underline underline-offset-2" onClick={e => e.stopPropagation()}>
              User Service Agreement
            </Link>
          </span>
        </button>

        {error && <p className="text-label text-danger mt-4">{error}</p>}
      </div>

      {/* Register button */}
      <div className="px-6 pb-10 pt-4 safe-area-bottom">
        <button
          onClick={handleRegister}
          disabled={!canSubmit || loading}
          className="w-full py-4 rounded-m font-semibold text-title-md text-ink-13
            bg-primary disabled:bg-primary-dark disabled:text-ink-13/60 disabled:cursor-not-allowed
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
