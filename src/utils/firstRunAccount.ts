/**
 * Whether the account that just signed in was created by this sign-in — the
 * signal onboarding needs.
 *
 * It used to be inferred from a pre-check: `/user/email/check` said the address
 * was free, so the code went down the register path and set firstRun. That works
 * until the check itself fails, in which case a brand-new address is treated as
 * an existing one and the first-run step is skipped for good.
 *
 * `/user/select/iotUserInfo` carries both `createdAt` and `lastLoginTime`, so the
 * question can be answered from the account itself.
 *
 * The two are compared to each other rather than to the clock on purpose. The
 * backend sends them without a zone ("2026-09-08 10:00:00"), which Date.parse
 * reads as local time — against Date.now() that is wrong by the whole UTC offset
 * and a fresh account looks hours old. Against each other the offset cancels: a
 * just-registered account logs in seconds after it was created, an account
 * anyone has used before logs in days later, and no interpretation of the zone
 * changes the gap between them.
 */
export const FIRST_RUN_WINDOW_MS = 10 * 60 * 1000

/** Parses the backend's zone-less timestamps; NaN for anything unusable. */
function parseStamp(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string' || !v.trim()) return NaN
  // "2026-09-08 10:00:00" → "2026-09-08T10:00:00", which every engine parses.
  return Date.parse(v.trim().replace(' ', 'T'))
}

export function isFirstRunAccount(
  user: { createdAt?: unknown; lastLoginTime?: unknown } | null | undefined,
): boolean {
  const created = parseStamp(user?.createdAt)
  if (!Number.isFinite(created)) return false

  const lastLogin = parseStamp(user?.lastLoginTime)
  // No login on record at all means this is the first one.
  if (!Number.isFinite(lastLogin)) return true

  return Math.abs(lastLogin - created) <= FIRST_RUN_WINDOW_MS
}
