import { isApiSuccess, type ApiResponse } from './apiClient'

/**
 * Whether an address already has an account, as far as /user/email/check will
 * say — which decides whether the login screen asks for a REGISTER code or a
 * LOGIN one.
 *
 * The endpoint publishes no response example, so this reads the shapes it
 * plausibly answers in and returns 'unknown' for anything else. That last case
 * matters more than the other two: the caller falls back to asking for the
 * ordinary sign-in code and letting the backend correct the intent, which is
 * what shipped before this and is known to work. A guess that reads an existing
 * user as new is exactly what 4.9.22 did, and it left them unable to sign in at
 * all — so an answer that cannot be read confidently must not be acted on.
 */
export type Registration = 'registered' | 'free' | 'unknown'

/** "not registered" and its kin — checked FIRST, since both contain "registered". */
const FREE_TEXT = /not\s+(been\s+)?(registered|exist|found)|unregistered|no\s+such|doesn'?t\s+exist|未注册|不存在/i
const TAKEN_TEXT = /(已|has\s+been|already)\s*(注册|registered)|registered|存在/i

function fromText(msg: string | undefined): Registration {
  if (!msg) return 'unknown'
  if (FREE_TEXT.test(msg)) return 'free'
  if (TAKEN_TEXT.test(msg)) return 'registered'
  return 'unknown'
}

function fromBool(v: unknown): Registration | null {
  if (v === true || v === 1 || v === '1' || v === 'true') return 'registered'
  if (v === false || v === 0 || v === '0' || v === 'false') return 'free'
  return null
}

export function readEmailCheck(res: ApiResponse<unknown> | null | undefined): Registration {
  if (!res) return 'unknown'

  // A refusal usually says which way it went; the message is the whole answer.
  if (!isApiSuccess(res.code)) {
    return fromText(`${res.message ?? ''} ${(res as { msg?: string }).msg ?? ''}`)
  }

  const data = res.data
  // "校验邮箱是否存在" — a bare boolean answers the question it asks.
  const bare = fromBool(data)
  if (bare) return bare

  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const k of ['exists', 'existed', 'isExist', 'registered', 'isRegistered']) {
      const b = fromBool(d[k])
      if (b) return b
    }
    // Some shapes invert it: "available" / "free" mean NOT registered.
    for (const k of ['available', 'isAvailable', 'free']) {
      const b = fromBool(d[k])
      if (b) return b === 'registered' ? 'free' : 'registered'
    }
  }

  return fromText(`${res.message ?? ''}`)
}
