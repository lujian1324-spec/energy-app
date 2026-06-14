import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Loader2, ChevronLeft, X } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { sendEmailCaptcha, loginByEmail } from '../api/authApi'

export default function LoginPage() {
  const { loading, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  // ── Email login flow ──
  const [emailFlow, setEmailFlow] = useState(false)        // show email login UI
  const [emailStep, setEmailStep] = useState<'email' | 'otp'>('email')   // UI-only sub-step
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailIotCaptchaId, setEmailIotCaptchaId] = useState<string | null>(null)
  const [emailSending, setEmailSending] = useState(false)
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailLoggingIn, setEmailLoggingIn] = useState(false)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const emailValid = EMAIL_RE.test(email.trim())

  // ── redirect on auth ──
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  // ── Cleanup cooldown on unmount ──
  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [])

  // ═══════════════════════════════════════
  //  Email Captcha Login Flow
  // ═══════════════════════════════════════

  const handleSendEmailCode = async () => {
    if (emailCooldown > 0 || !emailValid) { setEmailTouched(true); return }
    setEmailError(null)
    setEmailSending(true)
    try {
      const result = await sendEmailCaptcha(email.trim(), '3')
      if (result.code === 0 || result.code === '0') {
        setEmailIotCaptchaId(result.data?.iotCaptchaId ?? null)
        setEmailCooldown(60)
        setEmailStep('otp')
        cooldownRef.current = setInterval(() => {
          setEmailCooldown(prev => {
            if (prev <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); return 0 }
            return prev - 1
          })
        }, 1000)
      } else {
        setEmailError(result.message || result.msg || 'Failed to send code')
      }
    } catch {
      setEmailError('Failed to send verification code. Please try again.')
    } finally {
      setEmailSending(false)
    }
  }

  const handleEmailLogin = async () => {
    if (!emailIotCaptchaId || emailCode.trim().length < 6 || !email.trim()) return
    setEmailError(null)
    setEmailLoggingIn(true)
    try {
      const result = await loginByEmail(email.trim(), emailIotCaptchaId, emailCode.trim())
      if (result.code === 0 || result.code === '0') {
        navigate('/', { replace: true })
      } else {
        setEmailError(result.message || result.msg || 'Invalid verification code.')
      }
    } catch {
      setEmailError('Invalid verification code.')
    } finally {
      setEmailLoggingIn(false)
    }
  }

  const resetEmailFlow = () => {
    setEmailFlow(false)
    setEmailStep('email')
    setEmail('')
    setEmailCode('')
    setEmailIotCaptchaId(null)
    setEmailError(null)
    setEmailTouched(false)
    setEmailCooldown(0)
    if (cooldownRef.current) { clearInterval(cooldownRef.current); cooldownRef.current = null }
  }

  // Back: from otp → email, from email → entry
  const handleBack = () => {
    if (emailStep === 'otp') {
      setEmailStep('email')
      setEmailCode('')
      setEmailError(null)
    } else {
      resetEmailFlow()
    }
  }

  // ═══════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════

  // ── Circular back button (top-left), shown in email flow ──
  const BackButton = () => (
    <button
      onClick={handleBack}
      aria-label="Back"
      className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center
        text-ink-1 active:scale-95 transition-transform"
    >
      <ChevronLeft size={22} />
    </button>
  )

  // ── Bottom-pinned primary CTA ──
  const ContinueButton = ({ onClick, disabled, busy }: { onClick: () => void; disabled: boolean; busy: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="w-full py-4 rounded-m font-display text-title-md text-ink-13
        bg-primary disabled:bg-primary-dark disabled:text-ink-13/60 disabled:cursor-not-allowed
        active:scale-[0.98] transition-all flex items-center justify-center gap-2"
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : 'Continue'}
    </button>
  )

  return (
    <div className="min-h-screen bg-ink-12 flex flex-col">
      <AnimatePresence mode="wait">
        {emailFlow ? (
          emailStep === 'email' ? (
            // ═══════════════════════════════════════
            //  Step 1 — Enter email
            // ═══════════════════════════════════════
            <motion.div
              key="email-step"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col px-4 pt-4"
            >
              <BackButton />

              <div className="text-center mt-6 mb-8 px-4">
                <h1 className="font-display text-headline-lg text-ink-1">Enter your email</h1>
                <p className="text-body-md text-ink-7 mt-2">
                  We'll send a verification code to your email.
                </p>
              </div>

              {/* Email input card */}
              <div
                className={`rounded-l bg-ink-11 px-4 py-4 border-s transition-colors ${
                  emailTouched && !emailValid ? 'border-danger' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 border-b border-ink-8 pb-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(null) }}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    autoFocus
                    className="flex-1 bg-transparent text-body-lg text-ink-1
                      placeholder:text-ink-7 caret-primary focus:outline-none"
                  />
                  {email && (
                    <button
                      onClick={() => { setEmail(''); setEmailError(null) }}
                      aria-label="Clear email"
                      className="text-ink-7 active:scale-90 transition-transform"
                    >
                      <X size={18} className="rounded-full bg-ink-8 p-0.5 text-ink-12" />
                    </button>
                  )}
                </div>
                {emailTouched && !emailValid && (
                  <p className="text-label text-danger mt-2">Please enter a valid email address.</p>
                )}
                {emailError && (
                  <p className="text-label text-danger mt-2">{emailError}</p>
                )}
              </div>

              <div className="flex-1" />

              <div className="pb-8 pt-4">
                <ContinueButton
                  onClick={handleSendEmailCode}
                  disabled={!emailValid}
                  busy={emailSending}
                />
              </div>
            </motion.div>
          ) : (
            // ═══════════════════════════════════════
            //  Step 2 — Enter OTP
            // ═══════════════════════════════════════
            <motion.div
              key="otp-step"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col px-4 pt-4"
            >
              <BackButton />

              <div className="text-center mt-6 mb-8 px-4">
                <h1 className="font-display text-headline-lg text-ink-1">Enter verification code</h1>
                <p className="text-body-md text-ink-7 mt-2">
                  We sent a 6-digit verification code to<br />
                  <span className="font-semibold text-ink-1">{email}</span>
                </p>
              </div>

              {/* 6-box connected OTP input */}
              <div className="relative">
                <div
                  className={`flex rounded-l overflow-hidden border-s ${
                    emailError ? 'border-danger' : 'border-ink-8'
                  }`}
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-16 flex items-center justify-center text-title-lg font-semibold
                        ${i > 0 ? 'border-l-s' : ''}
                        ${emailError ? 'border-danger bg-danger/15 text-ink-1' : 'border-ink-8 text-ink-1'}`}
                    >
                      {emailCode[i] ?? ''}
                    </div>
                  ))}
                </div>
                {/* Invisible input capturing the digits */}
                <input
                  type="text"
                  inputMode="numeric"
                  value={emailCode}
                  onChange={e => { setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setEmailError(null) }}
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  aria-label="Verification code"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              {emailError && (
                <p className="text-label text-danger mt-2">{emailError}</p>
              )}

              {/* Resend code */}
              <div className="text-center mt-5">
                <button
                  onClick={handleSendEmailCode}
                  disabled={emailCooldown > 0 || emailSending}
                  className="text-body-md text-primary disabled:text-primary/60 transition-colors"
                >
                  {emailCooldown > 0 ? `Resend Code (${emailCooldown})` : 'Resend Code'}
                </button>
              </div>

              <div className="flex-1" />

              <div className="pb-8 pt-4">
                <ContinueButton
                  onClick={handleEmailLogin}
                  disabled={emailCode.length < 6 || !emailIotCaptchaId}
                  busy={emailLoggingIn}
                />
              </div>
            </motion.div>
          )
        ) : (
          // ═══════════════════════════════════════
          //  Entry — Sign up & Log in
          // ═══════════════════════════════════════
          <motion.div
            key="entry"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col px-6"
          >
            <div className="flex-1 flex flex-col justify-center">
              {/* Brand */}
              <div className="text-center mb-12">
                <h1 className="font-display text-display text-ink-1">Sierro</h1>
                <p className="text-body-md text-ink-7 mt-2">Smart Energy Management</p>
              </div>

              <div className="space-y-3">
                {/* Primary CTA — Email OTP */}
                <button
                  onClick={() => { setEmailFlow(true); setEmailStep('email') }}
                  disabled={loading}
                  className="w-full py-4 rounded-m bg-primary text-ink-13 font-display text-title-md
                    flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Mail size={18} />
                  Continue with Email
                </button>

                {/* Apple */}
                <button
                  onClick={() => { alert('Apple login not implemented yet') }}
                  className="w-full py-4 rounded-m bg-ink-1 text-ink-13 text-body-lg font-semibold
                    flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Continue with Apple
                </button>

                {/* Google */}
                <button
                  onClick={() => { alert('Google login not implemented yet') }}
                  className="w-full py-4 rounded-m bg-ink-10 border-s border-ink-9 text-ink-1 text-body-lg font-semibold
                    flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                {/* Continue as Guest */}
                <button
                  onClick={() => {
                    useAuthStore.getState().setGuestMode()
                    navigate('/', { replace: true })
                  }}
                  disabled={loading}
                  className="w-full pt-4 text-body-md text-ink-7 hover:text-ink-1 transition-colors"
                >
                  Continue as Guest
                </button>
              </div>
            </div>

            {/* Terms & Privacy */}
            <p className="pb-8 pt-4 text-center text-caption leading-relaxed text-ink-7">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="text-primary underline underline-offset-2">
                Terms of Use
              </Link>
              {' '}and{' '}
              <Link to="/privacy" className="text-primary underline underline-offset-2">
                Privacy Policy
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
