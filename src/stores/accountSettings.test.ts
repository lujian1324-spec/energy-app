/**
 * Settings follow the account (v4.17.1): B signing in after A must not see A's
 * Founding Member tag, push toggles or low-battery threshold, and A gets them
 * back on return.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  const m = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
  }
})

import { usePowerStationStore, accountSettingsKey } from './powerStationStore'

const A = '491513787113766912'
const B = '491513787113766999'
const store = () => usePowerStationStore.getState()

/** A signs in and makes the settings their own. */
function aConfigures() {
  store().switchSettingsAccount(A)
  store().applyFoundingMember(42)
  store().updateSettings({ pushNotifications: true, pushLowBattery: true, lowBatteryThreshold: 15 })
}

beforeEach(() => {
  localStorage.clear()
  usePowerStationStore.setState({
    settingsOwner: null,
    settings: { ...store().settings, pushNotifications: false, pushLowBattery: false, lowBatteryThreshold: 30, founderBadge: false, founderBadgeNumber: undefined },
  })
})

describe('switchSettingsAccount', () => {
  it('B signing in after A starts from the defaults, not A\'s tag, toggles or threshold', () => {
    aConfigures()
    store().switchSettingsAccount(null) // A signs out
    store().switchSettingsAccount(B)    // B signs in
    const s = store().settings
    expect(s.founderBadge).toBeFalsy()
    expect(s.founderBadgeNumber).toBeUndefined()
    expect(s.pushNotifications).toBe(false)
    expect(s.pushLowBattery).toBeFalsy()
    expect(s.lowBatteryThreshold ?? 30).toBe(30)
    expect(store().settingsOwner).toBe(B)
  })

  it('signing out leaves the defaults on screen and puts A\'s set away', () => {
    aConfigures()
    store().switchSettingsAccount(null)
    expect(store().settings.founderBadge).toBeFalsy()
    expect(store().settingsOwner).toBeNull()
    const saved = JSON.parse(localStorage.getItem(accountSettingsKey(A))!)
    expect(saved.settings).toMatchObject({ founderBadge: true, founderBadgeNumber: 42, pushNotifications: true, lowBatteryThreshold: 15 })
  })

  it('A signing back in gets their own settings back', () => {
    aConfigures()
    store().switchSettingsAccount(null)
    store().switchSettingsAccount(B)
    store().updateSettings({ lowBatteryThreshold: 50 })
    store().switchSettingsAccount(null)
    store().switchSettingsAccount(A)
    expect(store().settings).toMatchObject({ founderBadge: true, founderBadgeNumber: 42, pushNotifications: true, pushLowBattery: true, lowBatteryThreshold: 15 })
    // And B's own change was kept for B.
    store().switchSettingsAccount(null)
    store().switchSettingsAccount(B)
    expect(store().settings.lowBatteryThreshold).toBe(50)
  })

  it('switching straight from A to B (no sign-out seen) still separates them', () => {
    aConfigures()
    store().switchSettingsAccount(B)
    expect(store().settings.founderBadge).toBeFalsy()
    expect(store().settings.pushNotifications).toBe(false)
  })

  it('a restored session adopts an unowned set from before this change; a fresh sign-in does not', () => {
    store().updateSettings({ pushNotifications: true, lowBatteryThreshold: 20 })
    store().switchSettingsAccount(A, { adoptUnowned: true })
    expect(store().settings).toMatchObject({ pushNotifications: true, lowBatteryThreshold: 20 })

    usePowerStationStore.setState({ settingsOwner: null })
    store().updateSettings({ pushNotifications: true, lowBatteryThreshold: 20 })
    store().switchSettingsAccount(B)
    expect(store().settings.pushNotifications).toBe(false)
    expect(store().settings.lowBatteryThreshold ?? 30).toBe(30)
  })

  it('persists the owner with the settings it describes', () => {
    const partialize = usePowerStationStore.persist.getOptions().partialize!
    store().switchSettingsAccount(A)
    expect((partialize(store()) as Record<string, unknown>).settingsOwner).toBe(A)
  })

  it('clearFoundingMember takes the tag and number off', () => {
    store().applyFoundingMember(7)
    store().clearFoundingMember()
    expect(store().settings.founderBadge).toBe(false)
    expect(store().settings.founderBadgeNumber).toBeUndefined()
  })
})
