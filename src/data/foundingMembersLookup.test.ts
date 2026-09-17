/**
 * The lookup path, end to end, against a stand-in roster.
 *
 * The shipped table holds hashes and nothing else, so a real member's address
 * cannot be recovered from it to test with — and putting one in this file would
 * publish in the repo exactly what the hashing keeps out of the bundle. So the
 * table is replaced with a synthetic one built the same way the generator
 * builds the real one, and the whole path is exercised through it: normalise,
 * hash, look up, answer.
 */
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'

/** Exactly what scripts/build_founding_roster.py writes. */
const hash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex')

const ALICE = 'alice@example.com'
const ALICE_SECOND = 'alice.work@example.com'   // same person, second address
const BOB = 'bob@example.com'

vi.mock('./foundingMemberRoster', () => ({
  FOUNDING_MEMBER_HASHES: {
    [createHash('sha256').update('alice@example.com').digest('hex')]: 7,
    [createHash('sha256').update('alice.work@example.com').digest('hex')]: 7,
    [createHash('sha256').update('bob@example.com').digest('hex')]: 8,
  },
}))

const { foundingMemberNumber, isFoundingMember } = await import('./foundingMembers')

describe('looking an address up', () => {
  it('finds the member behind an address on the roster', async () => {
    await expect(foundingMemberNumber(ALICE)).resolves.toBe(7)
    await expect(foundingMemberNumber(BOB)).resolves.toBe(8)
    await expect(isFoundingMember(ALICE)).resolves.toBe(true)
  })

  it('finds them however they type it', async () => {
    // People type their address with capitals and pick up a trailing space from
    // autofill; the sheet is normalised, so the sign-in has to be too.
    await expect(foundingMemberNumber('  ALICE@Example.COM ')).resolves.toBe(7)
    await expect(foundingMemberNumber('Alice@example.com')).resolves.toBe(7)
  })

  it('gives a member with two addresses the same number for both', async () => {
    // Nine people on the real list registered twice. Both addresses have to
    // reach one badge, or which number they get depends on which one they used.
    await expect(foundingMemberNumber(ALICE_SECOND)).resolves.toBe(7)
  })

  it('says no to everyone else', async () => {
    await expect(foundingMemberNumber('stranger@example.com')).resolves.toBeNull()
    await expect(isFoundingMember('stranger@example.com')).resolves.toBe(false)
    // A near miss must not match: no prefix, domain-only or substring matching.
    await expect(foundingMemberNumber('alice@example.co')).resolves.toBeNull()
    await expect(foundingMemberNumber('example.com')).resolves.toBeNull()
    await expect(foundingMemberNumber('alice')).resolves.toBeNull()
  })

  it('says no to a missing address rather than throwing', async () => {
    await expect(foundingMemberNumber(null)).resolves.toBeNull()
    await expect(foundingMemberNumber(undefined)).resolves.toBeNull()
    await expect(foundingMemberNumber('')).resolves.toBeNull()
    await expect(foundingMemberNumber('   ')).resolves.toBeNull()
  })

  it('cannot be tricked by an inherited Object property', async () => {
    // A plain-object lookup answers 'toString' with a function; anything
    // truthy there would put a stranger on the screen wearing a badge.
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
      await expect(foundingMemberNumber(key)).resolves.toBeNull()
    }
  })

  it('agrees with the hash the generator would have written', async () => {
    // The one drift that would silently unmatch every member at once: the app's
    // normalisation parting ways with the script's.
    expect(hash('  ALICE@Example.COM ')).toBe(hash(ALICE))
    await expect(foundingMemberNumber('  ALICE@Example.COM ')).resolves.toBe(7)
  })
})
