import { CaptchaIntent } from '../api/authApi'

export type Intent = (typeof CaptchaIntent)[keyof typeof CaptchaIntent]

/**
 * Which verification-code intent the backend just told us we should have used.
 *
 * The sign-in screen cannot know up front whether an address is registered:
 * `/user/email/check` is behind the session, and this is the one screen with no
 * session. 4.9.22 guessed from whether the derived account name was free, which
 * reads an existing user as new whenever their account was created under a
 * different name than today's rule produces — and their sign-in then died on
 * "Email has been registered" with no way past it.
 *
 * `/user/send/email/captcha` already knows, and says so when it refuses. A
 * refused send costs no mail, so asking and being corrected is cheaper than
 * guessing — and it cannot be wrong.
 *
 * Returns `null` when the message says nothing about registration, in which case
 * the failure is a real one and belongs in front of the user.
 */
const ALREADY_REGISTERED = /has\s*been\s*regist|already\s*(been\s*)?regist|已(被)?注册/i
const NOT_REGISTERED = /not\s*(been\s*)?regist|unregistered|no\s*such|not\s*exist|not\s*found|未注册|不存在/i

export function correctedIntent(message: string): Intent | null {
  // Order matters: "has not been registered" contains "been regist" either way,
  // so the negative has to be ruled out first.
  if (NOT_REGISTERED.test(message)) return CaptchaIntent.REGISTER
  if (ALREADY_REGISTERED.test(message)) return CaptchaIntent.LOGIN
  return null
}
