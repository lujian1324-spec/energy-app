/**
 * What account name each shape of email address produces, and whether the
 * backend will accept it.
 *
 * This deliberately stops short of registering. `/user/register/email` needs a
 * verification code that only arrives in the real inbox, so actually running it
 * would mean mailing strangers and leaving accounts behind on production. What
 * it does instead is exercise the two gates a sign-up passes before that:
 *
 *   1. EMAIL_RE, the app's own address check on the email screen
 *   2. /user/account/check, which is read-only and answers whether the derived
 *      account name is acceptable and free (code 0), taken (20008), or refused
 *
 * Run: node scripts/probe-account-names.ts
 */
import { accountFromEmail } from '../src/utils/accountName.ts'

const BASE = 'https://solar.siseli.com/apis'
/** Same expression the email step uses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CASES: [string, string][] = [
  ['taka@sierro.us', 'the reported address — 4-character local part'],
  ['jo@sierro.us', '2 characters'],
  ['a@sierro.us', '1 character'],
  ['ab@b.co', 'short local part and short domain'],
  ['taka1@sierro.us', '5 characters'],
  ['jasons@sierro.us', 'exactly the 6-character minimum'],
  ['jasonsierro@sierro.us', 'comfortably long'],
  ['averyveryverylongmailboxname12345@sierro.us', 'longer than the 20-char limit'],
  ['first.last@sierro.us', 'a dot — legal in an address, not in an account'],
  ['first-last@sierro.us', 'a hyphen'],
  ['first_last@sierro.us', 'an underscore — legal in both'],
  ['jason+sierro@sierro.us', 'plus addressing'],
  ['j.d@sierro.us', 'dots and very short'],
  ['TaKa@Sierro.US', 'mixed case'],
  ['taka99@sierro.us', 'digits'],
  ['99@sierro.us', 'digits only, short'],
  ['taka@mail.sierro.co.uk', 'subdomain and multi-part TLD'],
  ['taka@sierro.technology', 'long TLD'],
]

type Row = {
  email: string
  note: string
  emailOk: boolean
  account: string
  len: number
  code: string
  verdict: string
}

async function checkAccount(account: string): Promise<{ code: string; message: string }> {
  const url = `${BASE}/user/account/check?account=${encodeURIComponent(account)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url)
      const j = (await r.json()) as { code?: unknown; message?: string }
      return { code: String(j.code), message: j.message ?? '' }
    } catch {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  return { code: 'ERR', message: 'no response' }
}

const rows: Row[] = []
for (const [email, note] of CASES) {
  const account = accountFromEmail(email)
  const emailOk = EMAIL_RE.test(email.trim())
  const { code, message } = emailOk
    ? await checkAccount(account)
    : { code: '-', message: 'never sent' }
  const verdict =
    !emailOk ? 'app rejects the address'
      : code === '0' ? 'free — would register'
        : code === '20008' ? 'name taken — app tries the next suffix'
          : code === 'ERR' ? 'no response' : `refused: ${message}`
  rows.push({ email, note, emailOk, account, len: account.length, code, verdict })
}

const w = (s: string, n: number) => s.padEnd(n).slice(0, n)
console.log(`\n${w('EMAIL', 44)} ${w('ACCOUNT', 22)} LEN  ${w('CODE', 6)} VERDICT`)
console.log('-'.repeat(120))
for (const r of rows) {
  console.log(
    `${w(r.email, 44)} ${w(r.account, 22)} ${String(r.len).padStart(3)}  ${w(r.code, 6)} ${r.verdict}`,
  )
}
console.log('-'.repeat(120))
const bad = rows.filter((r) => r.code !== '0' && r.code !== '20008')
console.log(
  `${rows.length} address shapes · ${rows.length - bad.length} would register · ` +
  `${bad.length} would not`,
)
for (const r of bad) console.log(`  ${r.email} — ${r.verdict}   (${r.note})`)
console.log(
  '\nNot covered: /user/register/email itself, which needs a code from the real\n' +
  'inbox. This checks the address gate and the account-name gate ahead of it.\n',
)
