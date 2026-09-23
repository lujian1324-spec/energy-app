import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'sierro-store-test-'))
process.env.STORE_FILE = join(dir, 'tokens.json')
process.env.TOKEN_ENC_KEY = 'ab'.repeat(32)
writeFileSync(process.env.STORE_FILE, JSON.stringify({
  native: { anon: [{ token: 'legacy-phone', platform: 'android' }] },
  webpush: { anon: [{ endpoint: 'legacy-browser' }] },
  users: { anon: { accessToken: 'legacy-session' } },
}))
const store = await import('./store.js')
after(() => rmSync(dir, { recursive: true, force: true }))

test('rejects missing and anonymous ownership before storing anything', () => {
  const before = readFileSync(process.env.STORE_FILE, 'utf8')
  for (const id of [undefined, null, '', ' ', 'anon', ' anon ', 'undefined', 'null']) {
    for (const action of [
      () => store.addNative(id, 'phone', 'android'),
      () => store.addWebPush(id, { endpoint: 'browser' }),
      () => store.setUserAuth(id, { accessToken: 'session' }),
      () => store.setUserSchedule(id, 'device', { enabled: true }),
      () => store.getNative(id),
      () => store.getWebPush(id),
      () => store.removeNative(id, 'phone'),
      () => store.removeWebPush(id, 'browser'),
    ]) assert.throws(action, /userId required/)
  }
  assert.equal(readFileSync(process.env.STORE_FILE, 'utf8'), before)
  assert.deepEqual(store.getAllUsers(), [])
})

test('native token transfers exclusively to B, preserving unrelated tokens', () => {
  store.addNative('A', 'shared-phone', 'android')
  store.addNative('A', 'other-phone', 'ios')
  store.addNative('B', 'shared-phone', 'ios')
  store.addNative('B', 'shared-phone', 'ios')
  assert.deepEqual(store.getNative('A'), [{ token: 'other-phone', platform: 'ios' }])
  assert.deepEqual(store.getNative('B'), [{ token: 'shared-phone', platform: 'ios' }])
  store.removeNative('A', 'shared-phone')
  assert.equal(store.getNative('B').length, 1)
})

test('web endpoint transfers exclusively to B with new keys', () => {
  store.addWebPush('web-A', { endpoint: 'shared-browser', keys: { auth: 'old' } })
  store.addWebPush('web-A', { endpoint: 'other-browser' })
  const sub = { endpoint: 'shared-browser', keys: { auth: 'new' } }
  store.addWebPush('web-B', sub)
  store.addWebPush('web-B', sub)
  assert.deepEqual(store.getWebPush('web-A'), [{ endpoint: 'other-browser' }])
  assert.deepEqual(store.getWebPush('web-B'), [sub])
  store.removeWebPush('web-A', sub.endpoint)
  assert.deepEqual(store.getWebPush('web-B'), [sub])
})

test('re-registration removes legacy anon recipients and preserves exact IDs', () => {
  const id = '491513787113766912'
  store.addNative(id, 'legacy-phone', 'android')
  store.addWebPush(id, { endpoint: 'legacy-browser' })
  const saved = JSON.parse(readFileSync(process.env.STORE_FILE, 'utf8'))
  assert.deepEqual(saved.native.anon, [])
  assert.deepEqual(saved.webpush.anon, [])
  assert.equal(store.getNative(id)[0].token, 'legacy-phone')
})

test('token transfer prunes unused credentials but preserves active schedules', () => {
  for (const owner of ['unused', 'scheduled']) {
    store.setUserAuth(owner, { accessToken: 'session' })
    if (owner === 'scheduled') store.setUserSchedule(owner, 'device', { enabled: true })
    store.addNative(owner, owner + '-phone', 'android')
    store.addNative('new-owner', owner + '-phone', 'android')
  }
  assert.equal(store.getUser('unused'), null)
  assert.equal(store.getUser('scheduled').accessToken, 'session')
})

test('background schedules require an actual poller session', () => {
  assert.equal(store.setUserSchedule('no-session', 'device', { enabled: true }), false)
  store.setUserAuth('prefs-only', { prefs: {} })
  assert.equal(store.setUserSchedule('prefs-only', 'device', { enabled: true }), false)
})

test('editing schedule watts clears the prior applied phase', () => {
  store.setUserAuth('scheduler', { accessToken: 'session' })
  assert.equal(store.setUserSchedule('scheduler', 'device', { enabled: true, sleepW: 150 }), true)
  store.setSchedulePhase('scheduler', 'device', 'sleep')
  assert.equal(store.getSchedulePhase('scheduler', 'device'), 'sleep')
  store.setUserSchedule('scheduler', 'device', { enabled: true, sleepW: 500 })
  assert.equal(store.getSchedulePhase('scheduler', 'device'), null)
})
