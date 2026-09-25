import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  platform: 'android',
  native: true,
  info: {} as Record<string, unknown>,
  calls: [] as string[],
  flexibleResult: { code: 0 },
  immediateResult: { code: 0 },
  listeners: [] as Array<(s: { installStatus: number }) => void>,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native, getPlatform: () => h.platform },
}))
vi.mock('@capawesome/capacitor-app-update', () => ({
  AppUpdate: {
    getAppUpdateInfo: vi.fn(async () => { h.calls.push('info'); return h.info }),
    startFlexibleUpdate: vi.fn(async () => { h.calls.push('flexible'); return h.flexibleResult }),
    performImmediateUpdate: vi.fn(async () => { h.calls.push('immediate'); return h.immediateResult }),
    completeFlexibleUpdate: vi.fn(async () => { h.calls.push('complete') }),
    addListener: vi.fn(async (_e: string, fn: (s: { installStatus: number }) => void) => { h.listeners.push(fn); return { remove: async () => {} } }),
  },
}))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}

import {
  Availability, InstallStatus, ResultCode, CHECK_INTERVAL_MS, DECLINE_BACKOFF_MS,
  decideUpdateAction, checkDue, checkForAppUpdate, installDownloadedUpdate, __resetAppUpdateForTests,
} from './appUpdate'

const available = { updateAvailability: Availability.AVAILABLE, flexibleUpdateAllowed: true, immediateUpdateAllowed: true }

beforeEach(() => {
  store.clear()
  h.platform = 'android'; h.native = true
  h.info = { ...available }
  h.calls = []; h.listeners = []
  h.flexibleResult = { code: ResultCode.OK }; h.immediateResult = { code: ResultCode.OK }
  __resetAppUpdateForTests()
})

describe('decideUpdateAction (v4.19.0)', () => {
  it('a new build downloads in the background (flexible)', () => {
    expect(decideUpdateAction(available, false)).toBe('flexible')
  })
  it('nothing to do when Play has nothing newer', () => {
    expect(decideUpdateAction({ updateAvailability: Availability.NOT_AVAILABLE }, false)).toBe('none')
    expect(decideUpdateAction({ updateAvailability: Availability.UNKNOWN }, false)).toBe('none')
  })
  it('a finished download installs, even right after a decline', () => {
    expect(decideUpdateAction({ updateAvailability: Availability.AVAILABLE, installStatus: InstallStatus.DOWNLOADED }, true)).toBe('install-downloaded')
  })
  it('high priority or a long-ignored update goes full screen', () => {
    expect(decideUpdateAction({ ...available, updatePriority: 4 }, false)).toBe('immediate')
    expect(decideUpdateAction({ ...available, clientVersionStalenessDays: 14 }, false)).toBe('immediate')
    expect(decideUpdateAction({ ...available, updatePriority: 3, clientVersionStalenessDays: 2 }, false)).toBe('flexible')
  })
  it('falls back to whichever flow Play allows', () => {
    expect(decideUpdateAction({ ...available, flexibleUpdateAllowed: false }, false)).toBe('immediate')
    expect(decideUpdateAction({ ...available, flexibleUpdateAllowed: false, immediateUpdateAllowed: false }, false)).toBe('none')
  })
  it('a recent decline holds back a new prompt', () => {
    expect(decideUpdateAction(available, true)).toBe('none')
  })
  it('resumes an immediate update left half-way, but lets a flexible download run', () => {
    expect(decideUpdateAction({ updateAvailability: Availability.IN_PROGRESS, immediateUpdateAllowed: true }, false)).toBe('immediate')
    expect(decideUpdateAction({ updateAvailability: Availability.IN_PROGRESS, installStatus: InstallStatus.DOWNLOADING, immediateUpdateAllowed: true }, false)).toBe('none')
  })
})

describe('checkDue', () => {
  it('asks again after the interval, and after a clock change', () => {
    expect(checkDue(null, 1000)).toBe(true)
    expect(checkDue(1000, 1000 + CHECK_INTERVAL_MS - 1)).toBe(false)
    expect(checkDue(1000, 1000 + CHECK_INTERVAL_MS)).toBe(true)
    expect(checkDue(5000, 1000)).toBe(true)
  })
})

describe('checkForAppUpdate', () => {
  it('Android only: iOS and the web never ask Play', async () => {
    h.platform = 'ios'
    expect(await checkForAppUpdate({ force: true })).toBe('none')
    h.platform = 'web'; h.native = false
    expect(await checkForAppUpdate({ force: true })).toBe('none')
    expect(h.calls).toEqual([])
  })

  it('starts a flexible update, then waits out the interval', async () => {
    expect(await checkForAppUpdate({ now: 10_000 })).toBe('flexible')
    expect(h.calls).toEqual(['info', 'flexible'])
    expect(await checkForAppUpdate({ now: 10_000 + 60_000 })).toBe('none')
    expect(h.calls).toEqual(['info', 'flexible'])
  })

  it('a declined prompt is not shown again for three days', async () => {
    h.flexibleResult = { code: ResultCode.CANCELED }
    await checkForAppUpdate({ now: 10_000 })
    expect(await checkForAppUpdate({ now: 10_000 + CHECK_INTERVAL_MS })).toBe('none')
    expect(await checkForAppUpdate({ now: 10_000 + DECLINE_BACKOFF_MS })).toBe('flexible')
  })

  it('a finished download installs when the app goes to the background', async () => {
    await checkForAppUpdate({ now: 10_000 })
    expect(await installDownloadedUpdate()).toBe(false) // nothing downloaded yet
    h.listeners.forEach(fn => fn({ installStatus: InstallStatus.DOWNLOADED }))
    expect(await installDownloadedUpdate()).toBe(true)
    expect(h.calls).toContain('complete')
  })

  it('opening the app with a download waiting installs it straight away', async () => {
    h.info = { updateAvailability: Availability.AVAILABLE, installStatus: InstallStatus.DOWNLOADED }
    expect(await checkForAppUpdate({ force: true })).toBe('install-downloaded')
    expect(h.calls).toEqual(['info', 'complete'])
  })

  it('a Play failure (e.g. a sideloaded build) is swallowed', async () => {
    const { AppUpdate } = await import('@capawesome/capacitor-app-update')
    vi.mocked(AppUpdate.getAppUpdateInfo).mockRejectedValueOnce(new Error('Install Error(-10): The app is not owned'))
    expect(await checkForAppUpdate({ force: true })).toBe('none')
  })
})
