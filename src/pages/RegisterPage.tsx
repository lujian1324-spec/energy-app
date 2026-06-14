import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, X } from 'lucide-react'
import { registerByEmail, sendEmailCaptcha } from '../api/authApi'

type Screen = 'email' | 'otp'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export default function RegisterPage() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('email')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [captchaId, setCaptchaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const startCountdown = () => setCountdown(60)

  const handleSendCode = async () => {
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.')
      return
    }
    setEmailError('')
    setLoading(true)
    try {
      const result = await sendEmailCaptcha(email.trim(), '1')
      const cid = result.data?.iotCaptchaId
      if (cid) setCaptchaId(cid)
      startCountdown()
      setScreen('otp')
    } catch {
      setEmailError('Failed to send code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (countdown > 0) return
    setLoading(true)
    try {
      const result = await sendEmailCaptcha(email.trim(), '1')
      const cid = result.data?.iotCaptchaId
      if (cid) setCaptchaId(cid)
      startCountdown()
    } catch {
      setOtpError('Failed to resend. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return
    setLoading(true)
    setOtpError('')
    try {
      const result = await registerByEmail(
        email.trim(),
        '',
        email.trim(),
        otp,
        captchaId || undefined
      )
      if (result.code === 0 || result.code === '0') {
        // First sign-up → run the Onboarding flow (PRD §4.7.3)
        navigate('/onboarding', { replace: true })
      } else {
        setOtpError(result.message ?? result.msg ?? 'Invalid code. Please try again.')
      }
    } catch {
      setOtpError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── OTP Screen ───────────────────────────────────────────────────────────
  if (screen === 'otp') {
    const digits = otp.padEnd(6, ' ').split('')
    const hasError = otpError.length > 0

    return (
      <div className="h-full flex flex-col bg-[#141414]">
        <div className="px-4 pt-5 safe-area-top">
          <button
            onClick={() => { setScreen('email'); setOtp(''); setOtpError('') }}
            className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
        </div>

        <div className="flex-1 px-6 pt-10">
          <h1 className="text-headline-lg font-bold text-white mb-2">Enter verification code</h1>
          <p className="text-body-md text-[#A0A0A5] mb-8">
            We sent a 6-digit verification code to{' '}
            <span className="font-semibold text-white">{email}</span>
          </p>

          {/* 6-box OTP input */}
          <div className="relative mb-4">
            {/* Visual boxes */}
            <div className="flex gap-2 mb-1" onClick={() => hiddenInputRef.current?.focus()}>
              {digits.map((d, i) => (
                <div
                  key={i}
                  className={`flex-1 h-14 rounded-m flex items-center justify-center text-title-lg font-bold
                    border transition-colors
                    ${hasError
                      ? 'border-danger bg-[rgba(255,53,48,0.06)] text-danger'
                      : i === otp.length
                        ? 'border-primary bg-[#262626] text-white'
                        : d.trim()
                          ? 'border-[rgba(255,255,255,0.2)] bg-[#262626] text-white'
                          : 'border-[rgba(255,255,255,0.12)] bg-[#1A1A1A] text-white'
                    }`}
                >
                  {d.trim()}
                </div>
              ))}
            </div>

            {/* Hidden numeric input */}
            <input
              ref={hiddenInputRef}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                setOtp(v)
                setOtpError('')
                if (v.length === 6) {
                  // auto-submit
                  setTimeout(() => hiddenInputRef.current?.blur(), 50)
                }
              }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              autoFocus
            />
          </div>

          {hasError && (
            <p className="text-danger text-body-md mb-4">{otpError}</p>
          )}

          {/* Resend */}
          <div className="text-center mb-8">
            {countdown > 0 ? (
              <span className="text-body-md text-primary">Resend Code ({countdown})</span>
            ) : (
              <button
                onClick={handleResend}
                className="text-body-md text-primary underline"
              >
                Resend Code
              </button>
            )}
          </div>
        </div>

        {/* Continue button */}
        <div className="px-6 pb-10 safe-area-bottom">
          <button
            onClick={handleVerifyOtp}
            disabled={otp.length !== 6 || loading}
            className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
              disabled:bg-primary-dark disabled:text-[rgba(0,0,0,0.4)] transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  // ─── Email Screen ─────────────────────────────────────────────────────────
  const emailInvalid = email.length > 0 && !isValidEmail(email)

  return (
    <div className="h-full flex flex-col bg-[#141414]">
      <div className="px-4 pt-5 safe-area-top">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
      </div>

      <div className="flex-1 px-6 pt-10">
        <h1 className="text-headline-lg font-bold text-white mb-2">Create account</h1>
        <p className="text-body-md text-[#A0A0A5] mb-8">
          Enter your email to get started with Sierro.
        </p>

        {/* Email input card */}
        <div className={`bg-[#262626] rounded-l px-4 py-4 flex items-center gap-3 mb-2
          ${emailInvalid || emailError ? 'border border-danger' : ''}`}
        >
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError('') }}
            placeholder="Email address"
            autoFocus
            className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#636366] outline-none"
          />
          {email.length > 0 && (
            <button onClick={() => setEmail('')}>
              <X size={16} className="text-[#636366]" />
            </button>
          )}
        </div>

        {(emailInvalid || emailError) && (
          <p className="text-danger text-body-md mt-1 mb-2">
            {emailError || 'Please enter a valid email address.'}
          </p>
        )}

        <p className="text-caption text-[#636366] mt-6 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-primary">Sign in</Link>
        </p>
      </div>

      {/* Continue button */}
      <div className="px-6 pb-10 safe-area-bottom">
        <button
          onClick={handleSendCode}
          disabled={!isValidEmail(email) || loading}
          className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
            disabled:bg-primary-dark disabled:text-[rgba(0,0,0,0.4)] transition-colors"
        >
          Continue
        </button>

        <p className="text-caption text-[#636366] mt-4 text-center leading-relaxed">
          By continuing, you agree to our{' '}
          <Link to="/terms" className="text-primary">Terms of Use</Link>
          {' '}and{' '}
          <Link to="/privacy" className="text-primary">Privacy Policy</Link>
        </p>
      </div>
    </div>
  )
}
