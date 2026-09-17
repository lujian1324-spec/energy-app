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

/** "This address already has an account." */
const ALREADY_REGISTERED = /has\s*been\s*regist|already\s*(been\s*)?regist|已(被)?注册/i

/**
 * "This address has no account."
 *
 * `account error` is in here because that is the phrase the backend actually
 * uses, and leaving it out is what broke registration. From 4.9.44 a new
 * address asked for a LOGIN code was refused with exactly this, nothing here
 * matched, the intent never flipped to REGISTER, no second send happened — and
 * the raw "account error" went on screen. No code ever arrived, so nobody could
 * register at all. The sign-in path below had known the phrase since 4.7.77;
 * this list simply never learned it, and no test fed it in.
 *
 * Note what is NOT here: a bare 账号. The old inline copy of this test in
 * LoginPage carried it, and it matches 账号已注册 — an EXISTING account — which
 * would flip the intent to REGISTER and send that person a "Register account"
 * email they cannot use. That is the 4.9.42 failure, and a register send
 * succeeds for a registered address, so the correction cannot undo it. 账号不存在
 * is already covered by 不存在.
 *
 * `account error` is vaguer than the rest, and a registered account that ever
 * drew it would get that same wrong email. It is matched anyway: a phrase the
 * backend demonstrably uses for a missing account, against a total block on new
 * sign-ups. If it turns out to mean anything else, the register send is refused
 * and the user is told — recoverable, unlike the current dead end.
 */
const NOT_REGISTERED =
  /not\s*(been\s*)?regist|unregistered|no\s*such|not\s*exist|not\s*found|account\s*error|未注册|不存在|账[号户]错误/i

/**
 * Does this rejection mean "there is no account for that address"?
 *
 * One definition, used by both places that ask. They used to be two regexes
 * written at different times, and they disagreed about `account error` — the
 * sign-in path knew it, the code-send path did not, and a new user hit the one
 * that did not. Anything that teaches one of them a new phrasing now teaches
 * both.
 */
export function saysNoSuchAccount(message: string): boolean {
  return NOT_REGISTERED.test(message)
}

export function correctedIntent(message: string): Intent | null {
  // Order matters: "has not been registered" contains "been regist" either way,
  // so the negative has to be ruled out first.
  if (saysNoSuchAccount(message)) return CaptchaIntent.REGISTER
  if (ALREADY_REGISTERED.test(message)) return CaptchaIntent.LOGIN
  return null
}
