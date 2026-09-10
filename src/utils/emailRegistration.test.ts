/**
 * The login screen picks REGISTER or LOGIN from this. Reading an existing user
 * as new is the failure that matters — 4.9.22 did exactly that and left them
 * unable to sign in — so anything ambiguous has to come back 'unknown', which
 * sends the caller down the path that was already known to work.
 */
import { describe, it, expect } from 'vitest'
import { readEmailCheck } from './emailRegistration'

const ok = (data: unknown, message = 'ok') => ({ code: 0, message, data })
const fail = (message: string) => ({ code: 20101, message, data: null })

describe('readEmailCheck', () => {
  it('reads a bare boolean as the answer to "does it exist"', () => {
    expect(readEmailCheck(ok(true))).toBe('registered')
    expect(readEmailCheck(ok(false))).toBe('free')
    expect(readEmailCheck(ok(1))).toBe('registered')
    expect(readEmailCheck(ok(0))).toBe('free')
  })

  it('reads the usual object shapes', () => {
    expect(readEmailCheck(ok({ exists: true }))).toBe('registered')
    expect(readEmailCheck(ok({ registered: false }))).toBe('free')
    expect(readEmailCheck(ok({ isExist: 1 }))).toBe('registered')
  })

  it('inverts the ones that mean the opposite', () => {
    // "available" true means the address is FREE, not that it is taken.
    expect(readEmailCheck(ok({ available: true }))).toBe('free')
    expect(readEmailCheck(ok({ available: false }))).toBe('registered')
  })

  it('reads a refusal by what it says', () => {
    expect(readEmailCheck(fail('Email has been registered'))).toBe('registered')
    expect(readEmailCheck(fail('该邮箱已注册'))).toBe('registered')
    expect(readEmailCheck(fail('Email is not registered'))).toBe('free')
    expect(readEmailCheck(fail('该邮箱未注册'))).toBe('free')
    expect(readEmailCheck(fail('no such account'))).toBe('free')
  })

  it('does not read "has not been registered" as registered', () => {
    // Both phrases contain "registered"; getting this backwards is the 4.9.22 bug.
    expect(readEmailCheck(fail('This email has not been registered yet'))).toBe('free')
  })

  it('says unknown for anything it cannot read', () => {
    expect(readEmailCheck(null)).toBe('unknown')
    expect(readEmailCheck(undefined)).toBe('unknown')
    expect(readEmailCheck(ok(null, ''))).toBe('unknown')
    expect(readEmailCheck(ok({ something: 'else' }, ''))).toBe('unknown')
    expect(readEmailCheck(fail('Too many requests, please try later'))).toBe('unknown')
    expect(readEmailCheck(fail('Internal error'))).toBe('unknown')
  })
})
