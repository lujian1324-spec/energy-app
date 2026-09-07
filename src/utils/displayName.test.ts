import { describe, it, expect } from 'vitest'
import { resolveDisplayName } from './displayName'

describe('resolveDisplayName', () => {
  it('takes the server nickname over everything else', () => {
    expect(resolveDisplayName({
      serverNickname: 'Marc',
      cachedName: 'Old Marc',
      authNickname: 'Older Marc',
      account: 'marc@sierro.us',
    })).toBe('Marc')
  })

  it('falls back through cache, login snapshot, then account', () => {
    const base = { authNickname: 'Snapshot', account: 'marc@sierro.us' }
    expect(resolveDisplayName({ ...base, cachedName: 'Cached' })).toBe('Cached')
    expect(resolveDisplayName(base)).toBe('Snapshot')
    expect(resolveDisplayName({ account: 'marc@sierro.us' })).toBe('marc@sierro.us')
    expect(resolveDisplayName({})).toBe('Sierro User')
  })

  it('skips blanks rather than choosing them', () => {
    expect(resolveDisplayName({
      serverNickname: '',
      cachedName: '   ',
      authNickname: null,
      account: 'marc@sierro.us',
    })).toBe('marc@sierro.us')
  })

  it('trims what it returns', () => {
    expect(resolveDisplayName({ serverNickname: '  Marc  ' })).toBe('Marc')
  })

  it('gives Settings and Profile the same answer from the same inputs', () => {
    // Settings has no server call; Profile writes what the server resolved to
    // back into the cache, so both end up reading the same name.
    const server = 'Marc'
    const cacheAfterProfileVisit = server
    const settings = resolveDisplayName({
      cachedName: cacheAfterProfileVisit,
      authNickname: 'stale-login-nickname',
      account: 'marc@sierro.us',
    })
    const profile = resolveDisplayName({
      serverNickname: server,
      cachedName: cacheAfterProfileVisit,
      authNickname: 'stale-login-nickname',
      account: 'marc@sierro.us',
    })
    expect(settings).toBe(profile)
  })
})
