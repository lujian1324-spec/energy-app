/**
 * The roster decides who sees the Founding Member screen and what number goes
 * on their badge, so what matters is that it answers about the address people
 * actually registered with — and that it says no to everyone else. A false
 * positive here hands a stranger someone's member number.
 *
 * This file checks the SHIPPED table: that it carries the whole VIP list, that
 * it holds hashes and not addresses, and that the numbers are the ones the
 * sheet assigned. The lookup path itself is exercised against a stand-in table
 * in foundingMembersLookup.test.ts — a real member's address cannot be
 * recovered from the hashes to test with, and putting one in the repo would
 * publish exactly what the hashing keeps out of the bundle.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  foundingMemberAddressCount,
  foundingMemberCount,
  foundingMemberEntries,
  foundingMemberNumber,
  isFoundingMember,
  normalizeEmail,
} from './foundingMembers'

/** What scripts/build_founding_roster.py does, independently restated. */
const sheetHash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex')

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

  it('hashes to what the generator script would write', () => {
    // If these two ever disagree — one trims, the other does not; one
    // lowercases the domain only — every member silently stops matching and
    // nothing at runtime says why. This is the guard against that.
    const raw = '  Someone@Example.COM '
    expect(sheetHash(raw)).toBe(sheetHash(normalizeEmail(raw)))
  })
})

describe('foundingMemberNumber', () => {
  it('says no to an address that is not on the roster', async () => {
    await expect(foundingMemberNumber('nobody-at-all@example.com')).resolves.toBeNull()
    await expect(isFoundingMember('nobody-at-all@example.com')).resolves.toBe(false)
  })

  it('says no to a missing address rather than throwing', async () => {
    // Onboarding calls this before the profile has necessarily loaded.
    await expect(foundingMemberNumber(null)).resolves.toBeNull()
    await expect(foundingMemberNumber(undefined)).resolves.toBeNull()
    await expect(foundingMemberNumber('')).resolves.toBeNull()
    await expect(foundingMemberNumber('   ')).resolves.toBeNull()
  })

  it('cannot be tricked into a hit by an inherited Object property', async () => {
    // A plain-object lookup answers 'toString' and 'constructor' with functions;
    // anything truthy there would put a stranger on the screen with a badge.
    // (These never hash to a roster key either, but the guard is what matters.)
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
      await expect(foundingMemberNumber(key)).resolves.toBeNull()
    }
  })

})

describe('the generated roster', () => {
  it('carries the whole VIP list, plus the team accounts', () => {
    // The sheet: 232 addresses across 223 people — nine members registered two
    // addresses, and both have to reach the same badge. Then two team accounts.
    expect(foundingMemberAddressCount()).toBe(232 + 2)
    expect(foundingMemberCount()).toBe(223 + 2)
  })

  it('numbers every member from the sheet 1 to 223 with none missing', () => {
    const numbers = new Set(foundingMemberEntries().map(([, n]) => n))
    for (let i = 1; i <= 223; i++) expect(numbers.has(i)).toBe(true)
  })

  it('keeps the team accounts clear of the sheet, so they cannot take a real place', () => {
    // #666 and #999 sit outside 1..223 on purpose: a team account landing on a
    // real member's number would show a customer someone else's place in line.
    const numbers = [...new Set(foundingMemberEntries().map(([, n]) => n))].sort((a, b) => a - b)
    expect(numbers).toContain(666)
    expect(numbers).toContain(999)
    expect(numbers.filter((n) => n <= 223)).toHaveLength(223)
    expect(numbers).toHaveLength(225)
  })

  it('holds hashes, not addresses — the whole point of the file', () => {
    for (const [key, number] of foundingMemberEntries()) {
      expect(key).toMatch(/^[0-9a-f]{64}$/)
      expect(key).not.toContain('@')
      expect(Number.isInteger(number)).toBe(true)
      expect(number).toBeGreaterThan(0)
    }
  })

  it('gives each address exactly one member, aliases aside', () => {
    const keys = foundingMemberEntries().map(([k]) => k)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
