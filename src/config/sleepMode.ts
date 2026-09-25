/**
 * Sleep Mode (Device Info) was replaced by Silent Mode in Charging Settings
 * (v4.22.0). The old editor, its client-side scheduler and `applySleepSchedule`
 * stay in the code, unused while this is false: a device's first Silent Mode
 * program is seeded from its saved Sleep Mode window (`initialProgram`), and the
 * relay drops the old window when the new program is saved.
 */
export const LEGACY_SLEEP_MODE_ENABLED: boolean = false
