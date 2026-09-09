import { describe, it, expect } from 'vitest'
import { correctedIntent } from './captchaIntent'
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

  it('leaves an unrelated failure alone, so it reaches the user', () => {
    expect(correctedIntent('Too many requests, please try later')).toBeNull()
    expect(correctedIntent('Service unavailable')).toBeNull()
    expect(correctedIntent('')).toBeNull()
  })
})
