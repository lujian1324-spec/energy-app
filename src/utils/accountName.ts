/** The backend's own account rule: letters, digits and underscore. */
const ACCOUNT_CHARS = /[^a-z0-9_]/g
const MIN_ACCOUNT = 6
const MAX_ACCOUNT = 20

/**
 * Account for a self-registered address: the local part of the email.
 *
 * Two things it has to survive. The local part can carry characters an account
 * name may not — `first.last` has to lose its dot — and what is left can be very
 * short, so it is padded out of the address's own domain rather than with
 * filler: taka@sierro.us becomes `takasi`, still recognisably that address.
 */
export function accountFromEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@')
  const clean = (v: string) => v.replace(ACCOUNT_CHARS, '')
  // An address whose local part survives none of the rule still has to produce a
  // name, and a run of digits is not one.
  let account = clean(local) || clean(domain) || 'user'
  if (account.length < MIN_ACCOUNT) account = (account + clean(domain)).slice(0, MIN_ACCOUNT)
  if (account.length < MIN_ACCOUNT) account = (account + '000000').slice(0, MIN_ACCOUNT)
  return account.slice(0, MAX_ACCOUNT) || 'user00'
}
