/**
 * Clear this phone's cached data once per app update (v4.23.0).
 *
 * Caches written by one version could be read by the next — history rows, a live
 * sample, a device list — in whatever shape the old code left them, and overlap
 * with what the new version fetches. So the first launch of every new version
 * starts from the server again: everything that is only a copy of server data is
 * dropped; everything that is the user's own (session, settings, schedules,
 * device icons, dismissals, the model they picked) is kept.
 *
 * Imported FIRST by main.tsx, before any store module: the persisted stores read
 * localStorage when their modules are evaluated, so the reset must come before.
 * IndexedDB is async, so this only raises a flag; `powerflowDB.getDB()` clears the
 * cache stores before it hands the database to anyone (no stale read possible).
 */
import versionInfo from '../version.json'

export const APP_VERSION_KEY = 'sierro-app-version'
/** Set when IndexedDB still owes its cache clear (powerflowDB reads it on open). */
export const CACHE_RESET_PENDING_KEY = 'sierro-cache-reset-pending'

/** localStorage entries that are only copies of server data. */
const CACHE_KEYS = ['powerflow-live-passthrough']
const CACHE_PREFIXES = ['sierro-config-missing']
/** Persisted stores that keep a cached list next to user state: drop only the cached part. */
const DEVICE_STORE_KEY = 'powerflow-device-store'
const DEVICE_STORE_CACHE_FIELDS = ['devices', 'deviceTotal', 'devicesListReady']

export function currentAppVersion(): string {
  return `${versionInfo.version}+${versionInfo.build}`
}

/**
 * Compare the running version with the last one that ran here; on a change drop
 * the cached data and flag IndexedDB. Returns true when it cleared.
 */
export function resetCachesOnUpdate(current = currentAppVersion(), storage: Storage = localStorage): boolean {
  let previous: string | null
  try { previous = storage.getItem(APP_VERSION_KEY) } catch { return false }
  if (previous === current) return false

  for (const key of CACHE_KEYS) storage.removeItem(key)
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && CACHE_PREFIXES.some(p => key.startsWith(p))) doomed.push(key)
  }
  doomed.forEach(k => storage.removeItem(k))

  const rawDevices = storage.getItem(DEVICE_STORE_KEY)
  if (rawDevices) {
    try {
      const parsed = JSON.parse(rawDevices)
      if (parsed?.state) for (const f of DEVICE_STORE_CACHE_FIELDS) delete parsed.state[f]
      storage.setItem(DEVICE_STORE_KEY, JSON.stringify(parsed))
    } catch {
      storage.removeItem(DEVICE_STORE_KEY)
    }
  }

  storage.setItem(CACHE_RESET_PENDING_KEY, current)
  storage.setItem(APP_VERSION_KEY, current)
  console.info(`[app] updated ${previous ?? '(first run)'} → ${current}: cached data cleared`)
  return true
}

// Runs on import (see file header).
try { resetCachesOnUpdate() } catch (e) { console.warn('[app] cache reset skipped:', e) }
