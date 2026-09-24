/**
 * Smart Schedule service pause (SW-14).
 *
 * Smart Schedule is paused for users: nothing in the shipped UI offers a way
 * into it or lets it be operated, no new charge-window dispatch is made for it
 * — not the local scheduler, not the relay's background tick — and a save that
 * was queued while a device was offline stays frozen where it is instead of
 * being replayed.
 *
 * Sleep Mode is untouched. The two features share one register and one relay
 * slot, so the pause is deliberately scoped to the Smart Schedule side of every
 * shared path (`mode: 'smart'`) rather than to the path itself.
 *
 * Nothing is deleted: `SmartSchedulePage`, `smartScheduleControl`,
 * `smartScheduleSave`, `useSmartScheduleFlush` and the offline queue all stay
 * wired, and the queue's contents are preserved. Flipping this one flag back to
 * `false` is the whole of resuming the service, so the modules cannot rot apart
 * from the flow in the meantime. The relay has its own copy of the same
 * decision in `server/smartSchedulePause.js`, since it ticks without the app.
 *
 * Typed `boolean` rather than the literal `true` so the guarded branches keep
 * being type-checked instead of being narrowed away.
 */
export const SMART_SCHEDULE_PAUSED: boolean = true
