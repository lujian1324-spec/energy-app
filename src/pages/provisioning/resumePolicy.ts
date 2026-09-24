/**
 * What the Add Device flow does when Android says the app is active again
 * (APP-002: the search page jumped on entry and again a few seconds later).
 *
 * Capacitor fires `appStateChange {isActive:true}` from EVERY Activity onResume,
 * and `{isActive:false}` only from onStop. A system dialog — the Nearby devices
 * permission prompt that BleClient.initialize() raises on entry, "turn on
 * Bluetooth", a vendor pop-up — pauses and resumes the Activity without ever
 * stopping it. So the handler ran on the user tapping Allow, flashed the full
 * "Checking Bluetooth…" overlay over the page, and started a second scan that
 * cancelled the first and emptied the device list while the first check was
 * still finishing.
 *
 * Now a resume only acts when there is something to re-read:
 *  - the screen was blocked (permission / Bluetooth off): re-check, show the
 *    checking state, and search once it is ready — the user is back from Settings;
 *  - the app really went to the background: re-check quietly, and search again
 *    only if no search is running, so a list being filled is not thrown away;
 *  - anything else (a dialog closed over the page): nothing.
 */
export interface ResumeContext {
  /** An `{isActive:false}` (onStop) arrived since the last resume. */
  wentBackground: boolean
  /** The scan screen was showing the permission or Bluetooth-off state. */
  wasBlocked: boolean
  /** The Add Device flow is on its search screen. */
  onScan: boolean
  /** A BLE search is running. */
  scanning: boolean
}

export interface ResumeAction {
  /** Re-read the Bluetooth permission and radio state. */
  recheck: boolean
  /** Put the screen into its checking state while that runs. */
  showChecking: boolean
  /** Start a search once the re-check says Bluetooth is ready. */
  scanWhenReady: boolean
}

const NOTHING: ResumeAction = { recheck: false, showChecking: false, scanWhenReady: false }

export function resumeAction({ wentBackground, wasBlocked, onScan, scanning }: ResumeContext): ResumeAction {
  if (wasBlocked) return { recheck: true, showChecking: onScan, scanWhenReady: onScan }
  if (!wentBackground) return NOTHING
  return { recheck: true, showChecking: false, scanWhenReady: onScan && !scanning }
}
