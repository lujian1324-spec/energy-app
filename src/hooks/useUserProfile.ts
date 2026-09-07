import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { getUserProfile, saveUserProfile } from '../db/powerflowDB'
import { fetchUserInfo } from '../api/authApi'
import { resolveDisplayName } from '../utils/displayName'
import type { UserProfile } from '../types/protocol'

/**
 * Loads the signed-in user's profile the same way for every screen that shows
 * it.
 *
 * Settings and Profile used to load it separately and rank the sources
 * differently — Settings put the login response's nickname above the saved
 * profile and never asked the server at all, Profile asked the server but never
 * wrote the answer back — so the two could sit on one account showing different
 * names. Both now run this, and both write what they resolved to into the same
 * account-scoped cache.
 *
 * Each source may only improve on the last: seed from the login response, then
 * the cache for this account, then the server.
 */
export function useUserProfile() {
  const authUser = useAuthStore((s) => s.user)
  const account = authUser?.account ?? ''
  // LoginData has an index signature, so the nickname arrives as `unknown`.
  const authNickname = typeof authUser?.nickname === 'string' ? authUser.nickname : ''
  const authEmail = authUser?.email ?? ''

  const seed = useCallback((): UserProfile => ({
    name: resolveDisplayName({ authNickname, account }),
    email: authEmail || account,
    avatar: null,
    memberSince: new Date().toISOString().slice(0, 10),
  }), [authNickname, authEmail, account])

  const [profile, setProfile] = useState<UserProfile>(seed)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      let next = seed()
      try {
        const saved = await getUserProfile(account)
        if (saved) {
          // Merge rather than replace: the cache may legitimately hold only an
          // avatar, and the account signed in now outranks anything the cache
          // has to say about who the user is.
          next = {
            ...next,
            ...saved,
            name: resolveDisplayName({ cachedName: saved.name, authNickname, account }),
            email: saved.email || next.email,
          }
          if (cancelled) return
          setProfile(next)
        }

        const res = await fetchUserInfo()
        if (res.code !== 0 && res.code !== '0') return
        const u = res.data
        if (!u) return

        const serverEmail = typeof u.email === 'string' ? u.email : ''
        const unmasked = serverEmail && !serverEmail.includes('*') ? serverEmail : ''
        next = {
          ...next,
          name: resolveDisplayName({
            serverNickname: typeof u.nickname === 'string' ? u.nickname : null,
            cachedName: next.name,
            authNickname,
            serverAccount: typeof u.account === 'string' ? u.account : null,
            account,
          }),
          // /user/select/iotUserInfo returns the address masked (j****@sierro.us),
          // and the design shows it in full, so a full address we already hold for
          // this account wins. But the registration account is a username and need
          // not be an address at all, so when that is all we have, the masked
          // server value is the more truthful thing to show.
          email: unmasked || (next.email.includes('@') ? next.email : serverEmail) || next.email,
        }
        if (cancelled) return
        setProfile(next)
        await saveUserProfile(account, { ...next, updatedAt: Date.now() })
      } catch (error) {
        console.error('[useUserProfile] load failed:', error)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [account, authNickname, seed, reloadKey])

  return { profile, setProfile, account, reload }
}
