// Run with:  node --test server/store.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir
let store

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sierro-store-'))
  process.env.STORE_FILE = join(dir, 'tokens.json')
  process.env.TOKEN_ENC_KEY = 'test-key-for-store-unit-tests-32b!'
  // Fresh module instance per test so FILE/env bind correctly.
  store = await import(`./store.js?t=${Date.now()}-${Math.random()}`)
})

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }) } catch {}
})

test('addNative rejects missing / blank / anon userId', () => {
  assert.throws(() => store.addNative(undefined, 'tok', 'ios'), /userId required/)
  assert.throws(() => store.addNative('', 'tok', 'ios'), /userId required/)
  assert.throws(() => store.addNative('anon', 'tok', 'ios'), /userId required/)
  assert.throws(() => store.addNative('  ', 'tok', 'android'), /userId required/)
})

test('addWebPush rejects missing / blank / anon userId', () => {
  assert.throws(() => store.addWebPush(undefined, { endpoint: 'e' }), /userId required/)
  assert.throws(() => store.addWebPush('anon', { endpoint: 'e' }), /userId required/)
})

test('addNative steals token from other userIds', () => {
  store.addNative('111', 'same-token', 'ios')
  store.addNative('222', 'same-token', 'ios')
  assert.equal(store.getNative('111').length, 0)
  assert.equal(store.getNative('222').length, 1)
  assert.equal(store.getNative('222')[0].token, 'same-token')
})

test('addWebPush steals endpoint from other userIds', () => {
  const sub = { endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } }
  store.addWebPush('111', sub)
  store.addWebPush('222', { ...sub, keys: { p256dh: 'x2', auth: 'y2' } })
  assert.equal(store.getWebPush('111').length, 0)
  assert.equal(store.getWebPush('222').length, 1)
})
