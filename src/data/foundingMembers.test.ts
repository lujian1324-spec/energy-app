/**
 * The roster decides who sees the Founding Member screen and what number goes
 * on their badge, so what matters is that it answers about the address people
 * actually registered with — and that it says no to everyone else. A false
 * positive here awards a stranger someone's member number.
 */
import { describe, it, expect } from 'vitest'
import {
  foundingMemberCount,
  foundingMemberEntries,
  foundingMemberNumber,
  isFoundingMember,
  normalizeEmail,
} from './foundingMembers'

describe('normalizeEmail', () => {
  it('lowercases and trims, because that is how addresses get typed', () => {
    expect(normalizeEmail('  Jason@Sierro.US  ')).toBe('jason@sierro.us')
    expect(normalizeEmail('a@b.co')).toBe('a@b.co')
  })

  it('answers empty for anything that is not a usable address', () => {
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail('')).toBe('')
    expect(normalizeEmail('   ')).toBe('')
    expect(normalizeEmail(123 as unknown as string)).toBe('')
  })
})

describe('foundingMemberNumber', () => {
  it('says no to an address that is not on the roster', () => {
    expect(foundingMemberNumber('nobody@example.com')).toBeNull()
    expect(isFoundingMember('nobody@example.com')).toBe(false)
  })

  it('says no to a missing address rather than throwing', () => {
    // Onboarding calls this before the profile has necessarily loaded.
    expect(foundingMemberNumber(null)).toBeNull()
    expect(foundingMemberNumber(undefined)).toBeNull()
    expect(foundingMemberNumber('')).toBeNull()
  })

  it('cannot be tricked into a hit by an inherited Object property', () => {
    // A plain-object lookup answers 'toString' and 'constructor' with functions;
    // a truthy answer there would put a stranger on the screen with a badge.
    expect(foundingMemberNumber('toString')).toBeNull()
    expect(foundingMemberNumber('constructor')).toBeNull()
    expect(foundingMemberNumber('__proto__')).toBeNull()
    expect(foundingMemberNumber('hasOwnProperty')).toBeNull()
  })

  it('finds every address the roster actually holds', () => {
    // Runs over the real roster, so it keeps working as names are added.
    for (const [email, number] of foundingMemberEntries()) {
      expect(foundingMemberNumber(email)).toBe(number)
      expect(foundingMemberNumber(` ${email.toUpperCase()} `)).toBe(number)
    }
  })
})

describe('the roster itself', () => {
  it('is written in the form the lookup can match', () => {
    // A key typed with a capital or a stray space would never match a real
    // sign-in, and nothing at runtime would ever say so.
    for (const [email] of foundingMemberEntries()) {
      expect(email).toBe(normalizeEmail(email))
      expect(email).toContain('@')
    }
  })

  it('gives each member their own number', () => {
    const numbers = foundingMemberEntries().map(([, n]) => n)
    expect(new Set(numbers).size).toBe(numbers.length)
    for (const n of numbers) expect(n).toBeGreaterThan(0)
    expect(foundingMemberCount()).toBe(numbers.length)
  })
})
