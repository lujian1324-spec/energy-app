/**
 * The monitor header's status when the device is online (v4.21.1).
 *
 * "Connected" used to be shown whenever the cloud said the device was online,
 * even when its readings had stopped arriving long ago. Once the newest reading
 * on screen is older than STALE_DATA_MS the header says when it was taken.
 */
import { clockLabel } from './historyPoints'

/** A device reports every few minutes; past this its numbers are not current. */
export const STALE_DATA_MS = 10 * 60_000

export function connectedLabel(lastSampleAt: number | null | undefined, now = Date.now()): string {
  if (lastSampleAt == null || !Number.isFinite(lastSampleAt) || now - lastSampleAt <= STALE_DATA_MS) return 'Connected'
  const d = new Date(lastSampleAt)
  const today = new Date(now)
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  const day = sameDay ? '' : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, `
  return `Last update ${day}${clockLabel(lastSampleAt)}`
}
