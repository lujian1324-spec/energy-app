import { describe, it, expect } from 'vitest'
import { correctedIntent, saysNoSuchAccount } from './captchaIntent'
import { CaptchaIntent } from '../api/authApi'

describe('correctedIntent', () => {
  it('sends an existing address down the sign-in path', () => {
    // The exact string the backend returned when 4.9.22 guessed wrong and asked
    // to register jason@sierro.us, which already had an account.
    expect(correctedIntent('Email has been registered')).toBe(CaptchaIntent.LOGIN)
    expect(correctedIntent('email already registered')).toBe(CaptchaIntent.LOGIN)
    expect(correctedIntent('该邮箱已注册')).toBe(CaptchaIntent.LOGIN)
  })

  it('sends an unknown address down the register path', () => {
    expect(correctedIntent('Email is not registered')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('Email has not been registered')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('unregistered email')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('no such account')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('user not found')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('账号不存在')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('该邮箱未注册')).toBe(CaptchaIntent.REGISTER)
  })

  it('reads "has not been registered" as unknown, not as already registered', () => {
    // Both phrases share "been registered"; getting this backwards would send an
    // unknown address round the loop it just failed.
    expect(correctedIntent('This email has not been registered yet')).toBe(CaptchaIntent.REGISTER)
  })

  it('reads "account error" as unknown — the phrase that blocked every sign-up', () => {
    /*
     * The regression this file failed to catch. From 4.9.44 the code send asked
     * for LOGIN first and let a rejection flip the intent; the backend refuses a
     * new address with exactly this, nothing matched it, the intent never
     * flipped, no second send happened, and the raw "account error" went on
     * screen. No code arrived, so no new account could be created at all.
     *
     * The sign-in path had known the phrase since 4.7.77. This list had not, and
     * no test fed it in — so CI stayed green through the whole outage.
     */
    expect(correctedIntent('account error')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('Account Error')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('account  error!')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('账号错误')).toBe(CaptchaIntent.REGISTER)
    expect(correctedIntent('账户错误')).toBe(CaptchaIntent.REGISTER)
  })

  it('still sends an existing address to sign-in, however it is worded', () => {
    // The other direction stays intact: a registered address must NEVER be
    // flipped to REGISTER, because that send SUCCEEDS and mails them a
    // "Register account" code they cannot use. That was 4.9.42.
    expect(correctedIntent('账号已注册')).toBe(CaptchaIntent.LOGIN)
    expect(correctedIntent('该账号已被注册')).toBe(CaptchaIntent.LOGIN)
  })

  it('leaves an unrelated failure alone, so it reaches the user', () => {
    expect(correctedIntent('Too many requests, please try later')).toBeNull()
    expect(correctedIntent('Service unavailable')).toBeNull()
    expect(correctedIntent('')).toBeNull()
  })
})

describe('saysNoSuchAccount', () => {
  /*
   * One definition, two callers. The code-send path and the sign-in path used
   * to carry separate regexes written at different times; they disagreed about
   * "account error", and a new user hit the one that did not know it. Both go
   * through this now, so a phrase learned once is learned everywhere.
   */
  it('agrees with correctedIntent on every phrasing', () => {
    const noAccount = [
      'account error', 'Account Error', '账号错误',
      'Email is not registered', 'unregistered email', 'no such account',
      'user not found', 'does not exist', '账号不存在', '该邮箱未注册',
    ]
    for (const m of noAccount) {
      expect(saysNoSuchAccount(m)).toBe(true)
      expect(correctedIntent(m)).toBe(CaptchaIntent.REGISTER)
    }
  })

  it('does not fire on a bare 账号, which an EXISTING account also carries', () => {
    // The sign-in path's old regex matched a bare 账号. Sharing that would make
    // 账号已注册 read as "no account" and mail a registered user a sign-up code.
    expect(saysNoSuchAccount('账号已注册')).toBe(false)
    expect(saysNoSuchAccount('账号已存在')).toBe(false)
  })

  it('says no to an unrelated failure', () => {
    expect(saysNoSuchAccount('Too many requests, please try later')).toBe(false)
    expect(saysNoSuchAccount('Invalid verification code')).toBe(false)
    expect(saysNoSuchAccount('')).toBe(false)
  })
})
