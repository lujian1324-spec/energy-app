import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import Icon from '../components/Icon'
import { sendEmailCaptcha, resetPassword } from '../api/authApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Step = 'request' | 'reset'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('request')

  // Step 1 — request code
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [captchaId, setCaptchaId] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)

  // Step 2 — reset password
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())
  const passwordValid = newPassword.length >= 6 && newPassword.length <= 32
  const confirmValid = confirmPassword === newPassword && confirmPassword.length > 0
  const codeValid = code.trim().length === 6
  const canReset = codeValid && passwordValid && confirmValid

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const handleSendCode = async () => {
    if (!emailValid || countdown > 0) return
    setError('')
    setSending(true)
    try {
      const result = await sendEmailCaptcha(email.trim(), '2')
      if (result.code === 0 || result.code === '0') {
        // data may be an object with iotCaptchaId or a raw string captchaId
        const cid = result.data?.iotCaptchaId
          ?? (typeof result.data === 'string' ? result.data : null)
        setCaptchaId(cid)
        setCountdown(60)
        setStep('reset')
      } else {
        setError(result.message || result.msg || 'Failed to send code.')
      }
    } catch {
      setError('Failed to send verification code. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleReset = async () => {
    if (!canReset) return
    setError('')
    setLoading(true)
    try {
      // `account` is required by the backend (rejects with "illegal argument: account
      // must not be blank" if omitted) — it accepts email as the account identifier,
      // same as the login page's "Username or email" field. Previously sent as '' and
      // omitted, which made every reset attempt fail validation before the verification
      // code was ever checked — surfaced to the user as a misleading "invalid/expired
      // code" message regardless of whether the code was actually correct.
      const result = await resetPassword(
        email.trim(),
        newPassword,
        code.trim(),
        captchaId ?? undefined,
        email.trim() || undefined
      )
      if (result.code === 0 || result.code === '0') {
        setSuccess(true)
        setTimeout(() => navigate('/login', { replace: true }), 2000)
      } else {
        const raw = result.message ?? result.msg ?? ''
        const friendly =
          /illegalArgument|illegal.?argument/i.test(raw)
            ? 'Invalid verification code or the code has expired. Please try again.'
            : /captcha|code.*invalid|verify/i.test(raw)
            ? 'Verification code is incorrect. Please check and retry.'
            : raw || 'Reset failed. Please try again.'
        setError(friendly)
      }
    } catch {
      setError('Reset failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-ink-12">
      <div className="px-4 pt-5 safe-area-top shrink-0">
        <button
          onClick={() => (step === 'reset' ? setStep('request') : navigate(-1))}
          className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 active:scale-95 transition-transform"
        >
          <Icon name="chevron-left" size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6">
        <h1 className="font-display text-headline-lg text-ink-1 mb-1">Forgot Password</h1>
        <p className="text-body-md text-ink-7 mb-8">
          {step === 'request'
            ? 'Enter your email to receive a verification code.'
            : 'Enter the code sent to your email and set a new password.'}
        </p>

        {success ? (
          <div className="text-center py-12">
            <p className="text-title-md text-primary font-semibold">Password reset!</p>
            <p className="text-body-md text-ink-7 mt-2">Redirecting to login...</p>
          </div>
        ) : step === 'request' ? (
          <>
            {/* Email */}
            <label className="block text-label text-ink-7 mb-1.5">Email</label>
            <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-1 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="Email address"
                autoCapitalize="none"
                autoCorrect="off"
                onKeyDown={e => { if (e.key === 'Enter') handleSendCode() }}
                className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
              />
              {email && (
                <button onClick={() => setEmail('')}><X size={16} className="text-ink-7" /></button>
              )}
            </div>

            {error && <p className="text-label text-danger mt-2">{error}</p>}

            {/* Send button — one input-box height below the email field */}
            <button
              onClick={handleSendCode}
              disabled={!emailValid || sending || countdown > 0}
              className="w-full mt-14 py-4 rounded-m font-semibold text-title-md text-ink-13
                bg-primary disabled:bg-primary-dark disabled:text-ink-13/60 disabled:cursor-not-allowed
                active:scale-[0.98] transition-[transform,opacity] flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : 'Send Verification Code'}
            </button>
          </>
        ) : (
          <>
            {/* Verification Code */}
            <label className="block text-label text-ink-7 mb-1.5">Verification Code</label>
            <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-3 mb-4 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                placeholder="6-digit code"
                autoComplete="one-time-code"
                maxLength={6}
                className="flex-1 min-w-0 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
              />
              <button
                onClick={handleSendCode}
                disabled={countdown > 0 || sending || !emailValid}
                className="shrink-0 whitespace-nowrap text-label font-semibold text-primary disabled:text-ink-7 transition-colors flex items-center gap-1"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : null}
                {countdown > 0 ? `Resend (${countdown})` : 'Resend'}
              </button>
            </div>

            {/* New Password */}
            <label className="block text-label text-ink-7 mb-1.5">New Password</label>
            <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-1 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
              <input
                type="password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError('') }}
                placeholder="6–32 characters"
                className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
              />
            </div>
            {newPassword.length > 0 && !passwordValid && (
              <p className="text-label text-danger mb-3">Password must be 6–32 characters.</p>
            )}
            {(newPassword.length === 0 || passwordValid) && <div className="mb-3" />}

            {/* Confirm Password */}
            <label className="block text-label text-ink-7 mb-1.5">Confirm Password</label>
            <div className="flex items-center gap-3 bg-ink-10 rounded-m px-4 py-4 mb-1 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary transition-shadow">
              <input
                type="password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                placeholder="Re-enter new password"
                onKeyDown={e => { if (e.key === 'Enter') handleReset() }}
                className="flex-1 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary"
              />
            </div>
            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <p className="text-label text-danger mb-3">Passwords do not match.</p>
            )}
            {(confirmPassword.length === 0 || confirmValid) && <div className="mb-3" />}

            {error && <p className="text-label text-danger mb-4">{error}</p>}
          </>
        )}
      </div>

      {!success && step === 'reset' && (
        <div className="px-6 pb-10 pt-2 safe-area-bottom shrink-0">
          <button
            onClick={handleReset}
            disabled={!canReset || loading}
            className="w-full py-4 rounded-m font-semibold text-title-md text-ink-13
              bg-primary disabled:bg-primary-dark disabled:text-ink-13/60 disabled:cursor-not-allowed
              active:scale-[0.98] transition-[transform,opacity] flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Reset Password'}
          </button>
        </div>
      )}
    </div>
  )
}
