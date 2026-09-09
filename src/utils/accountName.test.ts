import { describe, it, expect } from 'vitest'
import { accountFromEmail } from '../utils/accountName'

/**
 * The account name a self-registered address gets. It has to satisfy the
 * backend's account rule — letters, digits and underscore — which the raw local
 * part does not always do, and it should not come out so short that it reads
 * like a placeholder.
 */
describe('accountFromEmail', () => {
  it('uses the local part when it already qualifies', () => {
    expect(accountFromEmail('jasonsierro@sierro.us')).toBe('jasonsierro')
  })

  it('pads a short local part out of the address\u2019s own domain', () => {
    // taka@sierro.us was the report: four characters, and the account it made
    // looked nothing like a name anyone would choose.
    expect(accountFromEmail('taka@sierro.us')).toBe('takasi')
    expect(accountFromEmail('jo@example.com')).toBe('joexam')
  })

  it('drops characters an account name may not carry', () => {
    // A dot or a hyphen is ordinary in an address and illegal in an account.
    expect(accountFromEmail('first.last@sierro.us')).toBe('firstlast')
    expect(accountFromEmail('a-b@sierro.us')).toBe('absier')
  })

  it('keeps underscores and digits', () => {
    expect(accountFromEmail('taka_99@sierro.us')).toBe('taka_99')
  })

  it('lower-cases, so the same address always gives the same account', () => {
    expect(accountFromEmail('TaKaSierro@Sierro.US')).toBe('takasierro')
    expect(accountFromEmail('  taka@sierro.us  ')).toBe('takasi')
  })

  it('still returns something usable for an address with almost nothing in it', () => {
    expect(accountFromEmail('a@b')).toBe('ab0000')
    expect(accountFromEmail('!@#')).toBe('user00')
    expect(accountFromEmail('')).toBe('user00')
  })

  it('never exceeds the account length limit', () => {
    const long = `${'x'.repeat(40)}@sierro.us`
    expect(accountFromEmail(long)).toHaveLength(20)
  })
})
