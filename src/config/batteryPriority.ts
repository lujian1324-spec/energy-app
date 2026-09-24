/**
 * Battery Priority — hidden from users (v4.18.0), not deleted.
 *
 * The Device Settings row and its sheet render only when this is true. The
 * control path (`applyBatteryPriority` → 0x0086 + 0x0054 over passthrough) and
 * the confirmed-priority memory stay wired, so bringing the feature back is
 * this one line.
 */
export const BATTERY_PRIORITY_ENABLED: boolean = false
