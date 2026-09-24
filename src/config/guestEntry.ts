/**
 * "Continue as Guest" visibility (v4.17.0).
 *
 * Guest mode is hidden from users, not deleted. Its demo devices and the
 * simulator behind them wrote mock history into the same on-phone cache the
 * Real-Time Power chart reads, which showed up as one device's chart carrying
 * another's (or made-up) data. Nothing on the sign-in screen offers the way in
 * any more, so a user only ever sees their own account.
 *
 * Everything behind it stays wired (`setGuestMode`, demo devices, the
 * simulator). Only a build made with `VITE_ENABLE_GUEST=true` shows the entry,
 * which is what the E2E workflow uses to drive the app without a live account.
 * Consumer, QA, APK and iOS builds never set it.
 */
export const GUEST_ENTRY_ENABLED: boolean = import.meta.env.VITE_ENABLE_GUEST === 'true'
