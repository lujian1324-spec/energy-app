// Run with:  node --test server/poller.bind.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deviceBoundToUser } from './poller.js'

test('deviceBoundToUser: ownerUserId match (DeviceListItem shape)', () => {
  assert.equal(deviceBoundToUser({ id: '1', ownerUserId: '9999' }, '9999'), true)
  assert.equal(deviceBoundToUser({ id: '1', ownerUserId: '9999' }, '1111'), false)
})

test('deviceBoundToUser: accepts userId / bindUserId / bind.userId', () => {
  assert.equal(deviceBoundToUser({ userId: '42' }, '42'), true)
  assert.equal(deviceBoundToUser({ bindUserId: '7' }, '7'), true)
  assert.equal(deviceBoundToUser({ bind: { userId: '8' } }, '8'), true)
  assert.equal(deviceBoundToUser({ owner: { userId: '9' } }, '9'), true)
})

test('deviceBoundToUser: no markers → allow (listDevices already scoped)', () => {
  assert.equal(deviceBoundToUser({ id: '1', name: 'X' }, '9999'), true)
})

test('deviceBoundToUser: empty polled userId → deny', () => {
  assert.equal(deviceBoundToUser({ ownerUserId: '1' }, ''), false)
  assert.equal(deviceBoundToUser({ ownerUserId: '1' }, undefined), false)
})

test('deviceBoundToUser: stringifies numeric ids consistently', () => {
  // API returns Long-as-string; also accept number form for smaller ids.
  assert.equal(deviceBoundToUser({ ownerUserId: '491513787113766912' }, '491513787113766912'), true)
  assert.equal(deviceBoundToUser({ ownerUserId: 9999 }, '9999'), true)
})
