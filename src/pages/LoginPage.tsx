import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import Icon from '../components/Icon'
import { useAuthStore } from '../stores/authStore'
import { useDeviceStore } from '../stores/deviceStore'
import { sendEmailCaptcha, loginByEmail, CaptchaIntent } from '../api/authApi'
import { TERMS_URL, PRIVACY_URL } from '../config/legalLinks'
import { sanitizeUiCopy } from '../utils/uiCopy'

/**
 * Passwordless email sign-in — handoff `A_2.1_Sign up & Log in`,
 * `A_2.1.1_Continue with Email OPT`, `A_2.1.2_Continue with Email OPT`.
 *
 * Measured on the 4x exports (402x874):
 *   landing   title headline_large at y180, "Continue with Email" 370x68 card at y228,
 *             legal footer at y533
 *   email     title headline_medium at y155, subtitle body_medium/ink-5 at y190,
 *             underlined field, hairline + 370x44 Continue at the bottom
 *   code      six 62px cells across 370, ink-7 hairlines, "Resend Code (n)" in primary
 *
 * Google / Apple are deliberately out of scope for this pass, so the "OR" block and
 * those two rows are not built.
 */
type Step = 'landing' | 'email' | 'code' | 'password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_LEN = 6

const FIELD_CLASS =
  'flex items-center gap-3 bg-ink-10 rounded-l px-4 py-4 mb-3 min-h-[56px] h-[56px] box-border focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow'

/** Bottom action bar: ink-9 hairline over a 370x44 primary button (disabled = 50%). */
function BottomAction({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string
  onPress: () => void
  disabled: boolean
  busy: boolean
}) {
  return (
    <div
      className="border-t border-ink-9 px-4 pt-3"
      style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)) + 16px)' }}
    >
      <button
        onClick={onPress}
        disabled={disabled || busy}
        className="w-full h-11 rounded-m bg-primary text-primary-darker text-body-lg font-semibold
          disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
          transition-[transform,opacity] flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : label}
      </button>
    </div>
  )
}

export default function LoginPage() {
  const { loading, isAuthenticated, login } = useAuthStore()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('landing')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const [otpCode, setOtpCode] = useState('')
  const [captchaId, setCaptchaId] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [])

  const startCooldown = () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    setCooldown(60)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const sendCode = async () => {
    if (!emailValid) { setError('Please enter a valid email address.'); return false }
    setError(null)
    setSending(true)
    try {
      const result = await sendEmailCaptcha(email.trim(), CaptchaIntent.LOGIN)
      if (result.code === 0 || result.code === '0') {
        setCaptchaId(result.data?.iotCaptchaId ?? null)
        startCooldown()
        return true
      }
      setError(sanitizeUiCopy(result.message || result.msg, 'Failed to send code.'))
      return false
    } catch {
      setError('Failed to send verification code. Please try again.')
      return false
    } finally {
      setSending(false)
    }
  }

  const handleEmailContinue = async () => {
    const ok = await sendCode()
    if (ok) { setOtpCode(''); setStep('code') }
  }

  const finishSignIn = (user: unknown) => {
    useDeviceStore.getState().exitDemoMode()
    useAuthStore.setState({ isAuthenticated: true, isGuest: false, user: (user as never) ?? null })
    navigate('/', { replace: true })
  }

  const handleVerify = async () => {
    if (!captchaId || otpCode.length < OTP_LEN) return
    setError(null)
    setBusy(true)
    try {
      const result = await loginByEmail(email.trim(), captchaId, otpCode)
      if (result.code === 0 || result.code === '0') {
        finishSignIn(result.data)
      } else {
        setError(sanitizeUiCopy(result.message || result.msg, 'Invalid verification code.'))
      }
    } catch {
      setError('Invalid verification code.')
    } finally {
      setBusy(false)
    }
  }

  const handlePasswordSignIn = async () => {
    const account = username.trim()
    if (!account || !password) return
    setError(null)
    setBusy(true)
    try {
      const ok = await login(account, password)
      if (ok) navigate('/', { replace: true })
      else setError(useAuthStore.getState().error || 'Invalid credentials.')
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const continueAsGuest = () => {
    useAuthStore.getState().setGuestMode()
    navigate('/', { replace: true })
  }

  const backTo = (s: Step) => () => { setError(null); setStep(s) }

  const BackButton = ({ to }: { to: Step }) => (
    <button
      onClick={backTo(to)}
      aria-label="Back"
      className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center
        active:scale-95 transition-transform before:absolute before:content-[''] before:-inset-1"
    >
      <Icon name="chevron-left" size={24} />
    </button>
  )

  // ─── A_2.1 Sign up & Log in ──────────────────────────────────────────────
  if (step === 'landing') {
    return (
      <div className="h-full flex flex-col bg-ink-12 safe-area-top-header">
        <div className="flex-1 px-4">
          <h1 className="mt-[100px] text-headline-lg text-white text-center">Sign up or log in</h1>

          <button
            onClick={() => { setError(null); setStep('email') }}
            className="mt-5 w-full h-[68px] rounded-l bg-ink-10 px-4 flex items-center gap-3
              active:scale-[0.99] transition-transform"
          >
            <Icon name="email" size={24} />
            <span className="text-body-lg font-semibold text-ink-2">Continue with Email</span>
          </button>

          <p className="mt-[235px] text-caption text-ink-7 text-center leading-snug">
            By continuing, you agree to our{' '}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary">Terms of Use</a>
            {' '}and{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-primary">Privacy Policy</a>
          </p>

          {/* Not in the handoff. Kept so guest mode and existing username/password
              accounts stay reachable — see the 4.7.67 notes. */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <button onClick={continueAsGuest} disabled={loading} className="text-body-md text-ink-7">
              Continue as Guest
            </button>
            <button onClick={() => { setError(null); setStep('password') }} className="text-body-md text-ink-7">
              Sign in with password
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── A_2.1.1 Enter your email ────────────────────────────────────────────
  if (step === 'email') {
    return (
      <div className="h-full flex flex-col bg-ink-12">
        <div className="px-4 pb-5 safe-area-top-header">
          <BackButton to="landing" />
        </div>
        <div className="flex-1 px-4">
          <h1 className="mt-[18px] text-headline-md font-semibold text-white text-center">Enter your email</h1>
          <p className="mt-2 text-body-md text-ink-5 text-center">
            We&apos;ll send a verification code to your email.
          </p>

          <div className="mt-[38px] flex items-center gap-3 border-b border-ink-9 px-3 pb-1">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && emailValid) void handleEmailContinue() }}
              placeholder="name@example.com"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
            />
            {email && (
              <button onClick={() => setEmail('')} aria-label="Clear email" className="shrink-0">
                <X size={18} className="text-ink-7" />
              </button>
            )}
          </div>
          {error && <p className="mt-2 px-3 text-caption text-danger">{error}</p>}
        </div>
        <BottomAction label="Continue" onPress={handleEmailContinue} disabled={!emailValid} busy={sending} />
      </div>
    )
  }

  // ─── A_2.1.2 Enter verification code ─────────────────────────────────────
  if (step === 'code') {
    return (
      <div className="h-full flex flex-col bg-ink-12">
        <div className="px-4 pb-5 safe-area-top-header">
          <BackButton to="email" />
        </div>
        <div className="flex-1 px-4">
          <h1 className="mt-[18px] text-headline-md font-semibold text-white text-center">Enter verification code</h1>
          <p className="mt-2 text-body-md text-ink-5 text-center">
            We sent a 6-digit verification code to<br />
            <span className="font-semibold text-ink-2">{email.trim()}</span>
          </p>

          {/* One bordered row split into six 62px cells (4x export), with a transparent
              input on top so the numeric keyboard and one-time-code autofill still work. */}
          <div className="relative mt-[22px] h-[62px]">
            <div className="absolute inset-0 flex rounded-m border-s border-ink-7 overflow-hidden">
              {Array.from({ length: OTP_LEN }, (_, i) => (
                <div
                  key={i}
                  className={`flex-1 flex items-center justify-center text-headline-md font-semibold text-ink-2
                    ${i > 0 ? 'border-l border-ink-7' : ''}`}
                >
                  {otpCode[i] ?? ''}
                </div>
              ))}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LEN)); setError(null) }}
              autoComplete="one-time-code"
              maxLength={OTP_LEN}
              autoFocus
              aria-label="Verification code"
              className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-transparent
                outline-none select-none"
            />
          </div>

          <div className="mt-[10px] text-center">
            <button
              onClick={() => { void sendCode() }}
              disabled={cooldown > 0 || sending}
              className="text-body-md text-primary disabled:text-primary/50"
            >
              {cooldown > 0 ? `Resend Code (${cooldown})` : 'Resend Code'}
            </button>
          </div>
          {error && <p className="mt-3 text-caption text-danger text-center">{error}</p>}
        </div>
        <BottomAction
          label="Continue"
          onPress={handleVerify}
          disabled={otpCode.length < OTP_LEN || !captchaId}
          busy={busy}
        />
      </div>
    )
  }

  // ─── Username + password (not in the handoff; kept for existing accounts) ──
  return (
    <div className="h-full flex flex-col bg-ink-12">
      <div className="px-4 pb-5 safe-area-top-header">
        <BackButton to="landing" />
      </div>
      <div className="flex-1 px-4">
        <h1 className="mt-[18px] mb-6 text-headline-md font-semibold text-white text-center">Sign in with password</h1>
        <div className={FIELD_CLASS}>
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setError(null) }}
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 h-full bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
          />
          {username && (
            <button onClick={() => setUsername('')} aria-label="Clear username">
              <X size={16} className="text-ink-7" />
            </button>
          )}
        </div>
        <div className={FIELD_CLASS}>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            placeholder="Password"
            autoComplete="current-password"
            onKeyDown={e => { if (e.key === 'Enter') void handlePasswordSignIn() }}
            className="flex-1 h-full bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
          />
        </div>
        <div className="flex justify-between">
          <Link to="/register" className="text-body-md text-primary">Sign up</Link>
          <Link to="/forgot-password" className="text-body-md text-primary">Forgot password?</Link>
        </div>
        {error && <p className="mt-3 text-caption text-danger">{error}</p>}
      </div>
      <BottomAction
        label="Sign In"
        onPress={handlePasswordSignIn}
        disabled={!username.trim() || !password}
        busy={busy || loading}
      />
    </div>
  )
}
