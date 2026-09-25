/**
 * Android in-app updates from Google Play (v4.19.0).
 *
 * Google Play does not let an app replace itself without the user ever seeing
 * Play's consent, so "update automatically" is the closest flow Play allows:
 *
 *  1. On launch and whenever the app comes back to the foreground (at most once
 *     every CHECK_INTERVAL_MS), ask Play whether a newer build is published.
 *  2. A newer build → a FLEXIBLE update: Play asks once, then downloads in the
 *     background while the app keeps working.
 *  3. Downloaded → installed the next time the app goes to the background. Play
 *     installs silently then, and the user comes back to the new version. If the
 *     app is opened with a download already waiting, it installs right away.
 *
 * An update released with in-app priority ≥ HIGH_PRIORITY (Play Developer API,
 * `inAppUpdatePriority`), or one the phone has ignored for STALE_DAYS, uses the
 * IMMEDIATE flow instead: Play's full-screen update, then the app restarts.
 * An immediate update the user left half-way (UPDATE_IN_PROGRESS) is resumed,
 * as Google asks. A declined prompt is not shown again for DECLINE_BACKOFF_MS.
 *
 * Android native only: iOS, the web and a build not installed from Play
 * (sideloaded APK) do nothing. Every failure is swallowed — an update check must
 * never get in the way of using the app.
 */
import { Capacitor } from '@capacitor/core'

/** The plugin's numeric enums, restated so the decision is testable without it. */
export const Availability = { UNKNOWN: 0, NOT_AVAILABLE: 1, AVAILABLE: 2, IN_PROGRESS: 3 } as const
export const InstallStatus = { UNKNOWN: 0, PENDING: 1, DOWNLOADING: 2, INSTALLING: 3, INSTALLED: 4, FAILED: 5, CANCELED: 6, DOWNLOADED: 11 } as const
export const ResultCode = { OK: 0, CANCELED: 1, FAILED: 2, NOT_AVAILABLE: 3, NOT_ALLOWED: 4, INFO_MISSING: 5 } as const

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
export const DECLINE_BACKOFF_MS = 3 * 24 * 60 * 60 * 1000
export const HIGH_PRIORITY = 4
export const STALE_DAYS = 14

const CHECKED_KEY = 'sierro-app-update-checked-at'
const DECLINED_KEY = 'sierro-app-update-declined-at'

/** What Play reports (the subset the decision reads). */
export interface UpdateInfo {
  updateAvailability: number
  installStatus?: number
  immediateUpdateAllowed?: boolean
  flexibleUpdateAllowed?: boolean
  updatePriority?: number
  clientVersionStalenessDays?: number
}

export type UpdateAction = 'none' | 'install-downloaded' | 'immediate' | 'flexible'

/**
 * The one decision: what to do with Play's answer. `declinedRecently` holds back
 * a new prompt after the user said no; it never holds back installing a build
 * that is already downloaded, or resuming an immediate update.
 */
export function decideUpdateAction(info: UpdateInfo, declinedRecently: boolean): UpdateAction {
  if (info.installStatus === InstallStatus.DOWNLOADED) return 'install-downloaded'
  if (info.updateAvailability === Availability.IN_PROGRESS) {
    // A flexible download in progress finishes on its own; only an immediate
    // update the user left half-way needs resuming.
    if (info.installStatus === InstallStatus.DOWNLOADING || info.installStatus === InstallStatus.PENDING) return 'none'
    return info.immediateUpdateAllowed ? 'immediate' : 'none'
  }
  if (info.updateAvailability !== Availability.AVAILABLE || declinedRecently) return 'none'
  const urgent = (info.updatePriority ?? 0) >= HIGH_PRIORITY || (info.clientVersionStalenessDays ?? 0) >= STALE_DAYS
  if (urgent && info.immediateUpdateAllowed) return 'immediate'
  if (info.flexibleUpdateAllowed) return 'flexible'
  if (info.immediateUpdateAllowed) return 'immediate'
  return 'none'
}

/** Is it time to ask Play again? */
export function checkDue(lastCheckedAt: number | null, now: number): boolean {
  return lastCheckedAt == null || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= CHECK_INTERVAL_MS || now < lastCheckedAt
}

function readTime(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch { return null }
}
function writeTime(key: string, t: number): void {
  try { localStorage.setItem(key, String(t)) } catch { /* ignore */ }
}

export function isAppUpdateSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

type Plugin = typeof import('@capawesome/capacitor-app-update')['AppUpdate']

let plugin: Plugin | null = null
let busy = false
let downloaded = false
let listening = false

async function getPlugin(): Promise<Plugin> {
  if (!plugin) plugin = (await import('@capawesome/capacitor-app-update')).AppUpdate
  return plugin
}

async function listen(p: Plugin): Promise<void> {
  if (listening) return
  listening = true
  await p.addListener('onFlexibleUpdateStateChange', (state) => {
    if (state.installStatus === InstallStatus.DOWNLOADED) downloaded = true
  })
}

/**
 * Ask Play and act on the answer. `force` skips the interval (used at launch
 * when a finished download may be waiting). Safe to call as often as you like.
 */
export async function checkForAppUpdate({ force = false, now = Date.now() }: { force?: boolean; now?: number } = {}): Promise<UpdateAction> {
  if (!isAppUpdateSupported() || busy) return 'none'
  if (!force && !checkDue(readTime(CHECKED_KEY), now)) return 'none'
  busy = true
  try {
    const p = await getPlugin()
    await listen(p)
    const info = await p.getAppUpdateInfo()
    writeTime(CHECKED_KEY, now)
    const declinedAt = readTime(DECLINED_KEY)
    const action = decideUpdateAction(info, declinedAt != null && now - declinedAt < DECLINE_BACKOFF_MS)
    if (action === 'install-downloaded') {
      await p.completeFlexibleUpdate()
    } else if (action === 'immediate') {
      const r = await p.performImmediateUpdate()
      if (r.code === ResultCode.CANCELED) writeTime(DECLINED_KEY, now)
    } else if (action === 'flexible') {
      const r = await p.startFlexibleUpdate()
      if (r.code === ResultCode.CANCELED) writeTime(DECLINED_KEY, now)
    }
    return action
  } catch (e) {
    console.warn('[appUpdate] check failed:', e)
    return 'none'
  } finally {
    busy = false
  }
}

/** The app went to the background: install a finished download now (silent). */
export async function installDownloadedUpdate(): Promise<boolean> {
  if (!isAppUpdateSupported() || !downloaded) return false
  try {
    await (await getPlugin()).completeFlexibleUpdate()
    downloaded = false
    return true
  } catch (e) {
    console.warn('[appUpdate] install failed:', e)
    return false
  }
}

/**
 * Wire it up once at startup: check now (forced, so a waiting download installs),
 * again on each return to the foreground, and install a finished download when
 * the app is sent to the background.
 */
export async function startAppUpdates(): Promise<() => void> {
  if (!isAppUpdateSupported()) return () => {}
  void checkForAppUpdate({ force: true })
  try {
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void checkForAppUpdate()
      else void installDownloadedUpdate()
    })
    return () => { void handle.remove() }
  } catch {
    return () => {}
  }
}

/** Test hook: reset module state between cases. */
export function __resetAppUpdateForTests(): void {
  plugin = null; busy = false; downloaded = false; listening = false
}
