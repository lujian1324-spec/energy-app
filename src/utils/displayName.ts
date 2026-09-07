/**
 * The one place that decides which of the several names we hold for a user is
 * the one to show.
 *
 * Settings and Profile both render it and used to disagree: Settings ranked the
 * login response's nickname above the saved profile, Profile ranked the
 * server's above both, and Profile never wrote what it resolved back to the
 * cache — so the two screens could sit on the same account showing different
 * names.
 *
 * Freshest first: what the server just told us, then what this account has
 * saved locally, then the snapshot the login response left behind, then the
 * account it was registered with. Blank strings are skipped, not chosen.
 */
export function resolveDisplayName(parts: {
  serverNickname?: string | null
  cachedName?: string | null
  authNickname?: string | null
  serverAccount?: string | null
  account?: string | null
}): string {
  const found = [
    parts.serverNickname,
    parts.cachedName,
    parts.authNickname,
    parts.serverAccount,
    parts.account,
  ].find((v) => typeof v === 'string' && v.trim() !== '')
  return found ? found.trim() : 'Sierro User'
}
