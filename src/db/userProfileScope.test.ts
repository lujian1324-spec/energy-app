/**
 * Signing in as a second account on the same device must not read back the
 * first account's name, email or avatar (the cache used to sit under one
 * unscoped key).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const stores = new Map<string, Map<string, unknown>>()

vi.mock('idb', () => ({
  openDB: async () => ({
    put: async (store: string, value: unknown, key: string) => {
      if (!stores.has(store)) stores.set(store, new Map())
      stores.get(store)!.set(key, value)
    },
    get: async (store: string, key: string) => stores.get(store)?.get(key),
    delete: async (store: string, key: string) => { stores.get(store)?.delete(key) },
    objectStoreNames: { contains: () => true },
  }),
}))

const load = async () => {
  vi.resetModules()
  return import('./powerflowDB')
}

const profile = (name: string, email: string, avatar: string | null = null) => ({
  name, email, avatar, memberSince: '2026-01-01',
})

describe('user profile cache is scoped to an account', () => {
  beforeEach(() => stores.clear())

  it('does not hand one account the other account\u2019s profile', async () => {
    const db = await load()
    await db.saveUserProfile('alice@sierro.us', profile('Alice', 'alice@sierro.us'))
    expect(await db.getUserProfile('bob@sierro.us')).toBeNull()
    expect((await db.getUserProfile('alice@sierro.us'))?.name).toBe('Alice')
  })

  it('clears only the account it is asked to clear', async () => {
    const db = await load()
    await db.saveUserProfile('alice@sierro.us', profile('Alice', 'alice@sierro.us'))
    await db.saveUserProfile('bob@sierro.us', profile('Bob', 'bob@sierro.us'))
    await db.clearUserProfile('alice@sierro.us')
    expect(await db.getUserProfile('alice@sierro.us')).toBeNull()
    expect((await db.getUserProfile('bob@sierro.us'))?.name).toBe('Bob')
  })

  it('adopts a pre-scoping avatar but never its name or email', async () => {
    const db = await load()
    stores.set('user_profile', new Map([['profile', profile('Alice', 'alice@sierro.us', 'data:image/png;base64,AAA')]]))
    const adopted = await db.getUserProfile('bob@sierro.us')
    expect(adopted?.avatar).toBe('data:image/png;base64,AAA')
    expect(adopted?.name).toBe('')
    expect(adopted?.email).toBe('')
    // and the unscoped record is retired, so a third account cannot pick it up
    expect(stores.get('user_profile')?.has('profile')).toBe(false)
  })

  it('ignores a pre-scoping record that carries no avatar', async () => {
    const db = await load()
    stores.set('user_profile', new Map([['profile', profile('Alice', 'alice@sierro.us')]]))
    expect(await db.getUserProfile('bob@sierro.us')).toBeNull()
  })

  it('is a no-op without an account (guest)', async () => {
    const db = await load()
    await db.saveUserProfile('', profile('Nobody', 'x'))
    expect(await db.getUserProfile('')).toBeNull()
    expect(stores.get('user_profile')?.size ?? 0).toBe(0)
  })
})
