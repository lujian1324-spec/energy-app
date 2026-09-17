/**
 * The founding-member roster.
 *
 * Onboarding shows the Founding Member screen when the address the account was
 * registered with is on this list, and the number beside it is the one printed
 * on the badge — so these are real people's places in the order they joined,
 * not something generated at runtime. The redeem-code path in Settings
 * (`activateFounderBadge`) invents a random number instead, which is why it can
 * hand two people the same one; this list cannot.
 *
 * There is no endpoint for this yet. When one exists, keep `foundingMemberNumber`
 * as the single place that answers the question and let it call out instead —
 * every caller goes through it, and nothing else reads the table.
 *
 * Addresses are matched case-insensitively and with surrounding space trimmed,
 * because that is how people type them and how the backend echoes them back.
 * Nothing else is normalised: `a.b@gmail.com` and `ab@gmail.com` are different
 * addresses here even though Gmail treats them as one, so write the address the
 * account actually registered with.
 */

/** email (lowercase) → the member number shown on the badge. */
const ROSTER: Readonly<Record<string, number>> = {
  // Add founding members here, in join order:
  //   'first@example.com': 1,
  //   'second@example.com': 2,
}

/** Lowercased and trimmed; '' for anything that is not a usable address. */
export function normalizeEmail(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().toLowerCase()
}

/**
 * The member's number, or null if this address is not a founding member.
 *
 * Returns the number rather than a boolean because every caller needs it: the
 * screen prints it, and the badge stores it.
 */
export function foundingMemberNumber(email: string | null | undefined): number | null {
  const key = normalizeEmail(email)
  if (!key) return null
  const n = ROSTER[key]
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function isFoundingMember(email: string | null | undefined): boolean {
  return foundingMemberNumber(email) !== null
}

/** How many people are on the list. */
export function foundingMemberCount(): number {
  return Object.keys(ROSTER).length
}

/**
 * The roster as written, for the test that keeps it honest: an entry typed with
 * a capital or a stray space would never match a real sign-in, and nothing at
 * runtime would ever say so.
 */
export function foundingMemberEntries(): ReadonlyArray<readonly [string, number]> {
  return Object.entries(ROSTER)
}
