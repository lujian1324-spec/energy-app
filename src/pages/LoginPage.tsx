import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Icon from '../components/Icon'
import { useAuthStore } from '../stores/authStore'
import { useDeviceStore } from '../stores/deviceStore'
import {
  sendEmailCaptcha,
  loginByEmail,
  loginByAccount,
  defaultPasswordForAccount,
  fetchUserInfo,
  registerByEmail,
  checkAccountExists,
  CaptchaIntent,
} from '../api/authApi'
import { isApiSuccess } from '../utils/apiClient'
import { accountFromEmail } from '../utils/accountName'
import { correctedIntent, type Intent } from '../utils/captchaIntent'
import { isFirstRunAccount } from '../utils/firstRunAccount'
import { TERMS_URL, PRIVACY_URL } from '../config/legalLinks'
import { sanitizeUiCopy } from '../utils/uiCopy'
import TextField from '../components/TextField'
import BottomAction from '../components/BottomAction'

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
 *
 * There is no password path. /login/email only signs in an address that already exists,
 * so an unknown one is registered behind the scenes once its code checks out — that is
 * what makes the single flow cover both "sign up" and "log in", as the title says.
 */
type Step = 'landing' | 'email' | 'code'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/




/** First account name derived from the email that nobody has taken yet. */
async function pickFreeAccount(email: string): Promise<string> {
  const base = accountFromEmail(email)
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}${i}`
    try {
      const r = await checkAccountExists(candidate)
      if (isApiSuccess(r.code)) return candidate
    } catch {
      return candidate
    }
  }
  return `${base}${Date.now().toString().slice(-4)}`
}
const OTP_LEN = 6

/** Bottom action bar: ink-9 hairline over a 370x44 primary button (disabled = 50%). */

export default function LoginPage() {
  const { loading, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('landing')
  const [email, setEmail] = useState('')

  const [otpCode, setOtpCode] = useState('')
  const [captchaId, setCaptchaId] = useState<string | null>(null)
  // Whether this address needs registering — decided before the code is sent so the
  // captcha carries the right intent.
  const [isNewAccount, setIsNewAccount] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())

  /* Bounces an already-signed-in visitor off /login. It must not fire for the
     sign-in this screen just performed: finishSignIn flips isAuthenticated and
     then navigates, so without the guard this effect runs afterwards and
     replaces /onboarding with / — which is why a newly registered account never
     saw the onboarding step. */
  const signedInHere = useRef(false)
  useLayoutEffect(() => {
    if (isAuthenticated && !signedInHere.current) navigate('/', { replace: true })
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
      /*
       * Ask for the sign-in code, and let the backend say if this address needs
       * the other one. Never pick REGISTER from a guess.
       *
       * The two mistakes do not cost the same. A new address asked for a LOGIN
       * code is refused, the reply says so, the intent flips and the second send
       * works — one wasted round trip and no mail. An existing address asked for
       * a REGISTER code gets a "Register account" email it cannot use, and the
       * correction cannot help because the send SUCCEEDED. So the only safe
       * default is the sign-in code.
       *
       * 4.9.42 tried to decide up front from /user/email/check and got the
       * meaning of its answer backwards, which sent existing accounts down the
       * register path — exactly the failure above. 4.9.22 did the same thing
       * from a different signal, whether the DERIVED ACCOUNT NAME was free,
       * which reads an existing user as new whenever their account was created
       * under a name other than today's rule produces (jason@sierro.us is
       * `jasonSierro` on the server, `jasons` by the current derivation).
       *
       * Twice now the up-front check has been the thing that broke it. What the
       * endpoint actually returns is still not written down anywhere, so until
       * it is, this does not read it.
       */
      const addr = email.trim()
      let intent: Intent = CaptchaIntent.LOGIN
      let result = await sendEmailCaptcha(addr, intent)
      if (!isApiSuccess(result.code)) {
        const corrected = correctedIntent(`${result.message ?? ''} ${result.msg ?? ''}`)
        if (corrected && corrected !== intent) {
          intent = corrected
          result = await sendEmailCaptcha(addr, intent)
        }
      }
      if (isApiSuccess(result.code)) {
        setIsNewAccount(intent === CaptchaIntent.REGISTER)
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

  /**
   * `firstRun` is the account we just created, which `A_2.2.2_Onboarding_Device`
   * greets with the add-your-first-device step. Signing in to an account that
   * already exists goes straight to the device list, as before.
   */
  const finishSignIn = (user: unknown, { firstRun = false } = {}) => {
    signedInHere.current = true
    useDeviceStore.getState().exitDemoMode()
    useAuthStore.setState({ isAuthenticated: true, isGuest: false, user: (user as never) ?? null })
    navigate(firstRun ? '/onboarding' : '/', { replace: true })
  }

  /**
   * Register the address, then sign in with the account we just created. The account is
   * the email's local part (suffixed if taken) and the password is that plus 1234.
   */
  const registerThenSignIn = async (): Promise<boolean> => {
    const addr = email.trim()
    const account = await pickFreeAccount(addr)
    const password = defaultPasswordForAccount(account)
    const reg = await registerByEmail(account, password, addr, otpCode, captchaId ?? undefined)
    if (!isApiSuccess(reg.code)) {
      setError(sanitizeUiCopy(reg.message || reg.msg, 'Could not create your account.'))
      return false
    }
    const login = await loginByAccount(account, password)
    if (!isApiSuccess(login.code)) {
      setError(sanitizeUiCopy(login.message || login.msg, 'Account created — please sign in again.'))
      return false
    }
    finishSignIn(login.data, { firstRun: true })
    return true
  }

  const handleVerify = async () => {
    if (!captchaId || otpCode.length < OTP_LEN) return
    setError(null)
    setBusy(true)
    try {
      if (isNewAccount) {
        await registerThenSignIn()
        return
      }
      const result = await loginByEmail(email.trim(), captchaId, otpCode)
      if (isApiSuccess(result.code)) {
        /**
         * Ask the account whether it was just created rather than inferring it
         * from the pre-check. /user/email/check answering "free" is what sends
         * the flow down the register path and sets firstRun; when that check
         * fails, a brand-new address is treated as an existing one and the
         * onboarding step is skipped for good. The user object carries
         * createdAt and lastLoginTime, which settle it.
         */
        let firstRun = false
        try {
          const me = await fetchUserInfo()
          if (isApiSuccess(me.code)) firstRun = isFirstRunAccount(me.data)
        } catch { /* fall back to the ordinary sign-in */ }
        finishSignIn(result.data, { firstRun })
        return
      }
      // The pre-check can be wrong (it failed, or the address was removed between steps).
      // If sign-in says there is no such account, register with the code we already have.
      const msg = `${result.message ?? ''} ${result.msg ?? ''}`.toLowerCase()
      if (/not exist|no such|unregistered|not found|account error|\u8d26\u53f7/.test(msg)) {
        await registerThenSignIn()
        return
      }
      setError(sanitizeUiCopy(result.message || result.msg, 'Invalid verification code.'))
    } catch {
      setError('Invalid verification code.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * The sixth digit signs in: A_2.1.2 has no confirm step, and reaching for a
   * button after the code is already complete is a step nobody wants. The button
   * stays as the fallback for a code that arrives by paste or autofill without an
   * input event landing.
   *
   * The ref keeps the effect off handleVerify's identity, which changes every
   * render. A code is submitted once — editing it after a rejection makes a new
   * one, which submits again on the sixth digit.
   */
  const verifyRef = useRef(handleVerify)
  verifyRef.current = handleVerify
  const submittedCode = useRef<string | null>(null)
  useEffect(() => {
    if (step !== 'code') { submittedCode.current = null; return }
    if (busy || !captchaId || otpCode.length < OTP_LEN) return
    if (submittedCode.current === otpCode) return
    submittedCode.current = otpCode
    void verifyRef.current()
  }, [step, otpCode, captchaId, busy])

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
        {/* The wordmark and its line carry the screen; nothing else competes. */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {/* Not the Anton display face: `.text-display` forces Anton and zero
              tracking, and the frame sets the wordmark in the body face, spaced out. */}
          <h1 className="font-sans text-[32px] leading-none font-semibold text-white tracking-[0.22em] pl-[0.22em]">
            SIERRO
          </h1>
          <p className="mt-3 text-body-lg text-ink-4">Protect What Matters Most</p>
        </div>

        <div className="px-4 pb-8">
          <button
            onClick={() => { setError(null); setStep('email') }}
            className="w-full h-14 rounded-l border-s border-ink-8 px-4 flex items-center gap-3
              active:scale-[0.99] transition-transform"
          >
            <Icon name="email" size={24} />
            <span className="text-body-lg font-semibold text-ink-2">Continue with Email</span>
          </button>

          <p className="mt-4 text-caption text-ink-7 text-center leading-snug">
            By continuing, you agree to our{' '}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary">Terms of Use</a>
            {' '}and{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-primary">Privacy Policy</a>
          </p>

          {/* Not in the handoff, kept because guest mode is a shipped feature. */}
          <div className="mt-6 flex flex-col items-center">
            <button onClick={continueAsGuest} disabled={loading} className="text-body-md text-ink-7">
              Continue as Guest
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
        <div className="flex-1 min-h-0 px-4">
          <h1 className="mt-[18px] text-headline-md font-semibold text-white text-center">Enter your email</h1>
          <p className="mt-2 text-body-md text-ink-5 text-center">
            We&apos;ll send a verification code to your email.
          </p>

          <div className="mt-[19px]">
            <TextField
              type="email"
              inputMode="email"
              ariaLabel="Email"
              value={email}
              onChange={(next) => { setEmail(next); setError(null) }}
              onEnter={() => { if (emailValid) void handleEmailContinue() }}
              onClear={() => setEmail('')}
              placeholder="name@example.com"
              error={error}
              autoFocus
            />
          </div>
        </div>
        <BottomAction label="Continue" onPress={handleEmailContinue} disabled={!emailValid} busy={sending} />
      </div>
    )
  }

  // ─── A_2.1.2 Enter verification code ─────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-ink-12">
      <div className="px-4 pb-5 safe-area-top-header">
        <BackButton to="email" />
      </div>
      <div className="flex-1 min-h-0 px-4">
        <h1 className="mt-[18px] text-headline-md font-semibold text-white text-center">Enter verification code</h1>
        <p className="mt-2 text-body-md text-ink-5 text-center">
          We sent a 6-digit verification code to<br />
          {/* The subject line, so the message can be found in a crowded inbox or
              fished out of spam — it does not carry the Sierro name. */}
          <span className="font-semibold text-ink-2">{email.trim()}</span> titled [Solar of things]
        </p>

        {/* One bordered row split into six 62px cells (4x export), with a transparent
            input on top so the numeric keyboard and one-time-code autofill still work. */}
        <div className="relative mt-[22px] h-[62px]">
          {/* A_2.1.2 -v 錯誤 turns the whole row red — danger hairlines over a
              danger-darker fill — and keeps the digits in ink-2. */}
          <div
            className={`absolute inset-0 flex rounded-m border-s overflow-hidden ${
              error ? 'border-danger bg-danger-darker' : 'border-ink-7'
            }`}
          >
            {Array.from({ length: OTP_LEN }, (_, i) => (
              <div
                key={i}
                className={`flex-1 flex items-center justify-center text-headline-md font-semibold text-ink-2
                  ${i > 0 ? (error ? 'border-l border-danger' : 'border-l border-ink-7') : ''}`}
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

        {/* The message belongs under the row and pushes Resend Code down, rather
            than stacking below it. */}
        {error && <p className="mt-1 pl-1 text-caption text-danger">{error}</p>}

        <div className={`text-center ${error ? 'mt-2' : 'mt-[10px]'}`}>
          <button
            onClick={() => { void sendCode() }}
            disabled={cooldown > 0 || sending}
            className="text-body-md text-primary disabled:text-primary/50"
          >
            {cooldown > 0 ? `Resend Code (${cooldown})` : 'Resend Code'}
          </button>
        </div>
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
