/**
 * What the Device card's AC switch shows — decided from what the device
 * reported, never from whether it is online.
 *
 * The switch used to read `powerStates[id] ?? device.isOnline`: a page-local
 * map written only by taps, falling back to "online means on". So any online
 * device showed ON, a switch turned off came back ON once the page remounted
 * ("回弹"), another phone never saw a change, and a device that had powered off
 * while the cloud still listed it online showed ON as well.
 *
 * Sources, all of them the AC OUTPUT state — the one the 0x0080 write changes:
 *  - live: Modbus run-state 0x0126 bit 2, from the passthrough or BLE read;
 *  - cloud: `acOutputs` in /remote/device/state/latest (the platform labels it
 *    "AC Output", On/Off). `inversionState` is the inverter, not the outlets:
 *    with AC input connected the outlets run on bypass while it idles.
 *  - command: a switch the user just flipped.
 *
 * Rules:
 *  - An offline device shows OFF: nothing it last said can be trusted as now.
 *  - A command in flight shows its target.
 *  - A sent command shows its target until the device reports a sample taken
 *    after the write returned — then the device is right, whichever way.
 *  - Otherwise the newest device sample wins; live beats cloud on a tie.
 *  - Cloud times come from the backend's clock; live and command times from
 *    this phone's. A cloud sample only counts as newer when it is newer by more
 *    than CLOUD_CLOCK_SKEW_MS, so a phone clock running behind cannot make a
 *    pre-switch cloud report look fresher than the read-back that followed it.
 *  - With nothing reported the switch shows OFF, never ON: an outlet shown
 *    live when it is not is the failure this exists to prevent.
 */

export interface AcSample {
  on: boolean
  /** When the device state was sampled (ms). Unknown sorts as oldest. */
  at?: number
}

export interface AcCommand {
  on: boolean
  /** When the write returned, or started while still sending (ms). */
  at: number
  status: 'sending' | 'sent'
}

export interface AcOutputSources {
  connected: boolean
  cloud?: AcSample | null
  live?: AcSample | null
  command?: AcCommand | null
}

export interface AcOutputView {
  on: boolean
  /** Some real report (or the user's own command) backs `on`. */
  known: boolean
  /** A write is in flight. */
  pending: boolean
}

/** Allowance for the backend's clock versus this phone's. */
export const CLOUD_CLOCK_SKEW_MS = 30_000

const when = (s: AcSample) => s.at ?? Number.NEGATIVE_INFINITY
/** A cloud sample's time on this phone's clock, taken at its least favourable. */
const cloudWhen = (s: AcSample) => when(s) - CLOUD_CLOCK_SKEW_MS

/** The newest real device report (live preferred on a tie), with its phone-clock time. */
function newest(cloud?: AcSample | null, live?: AcSample | null): { sample: AcSample; at: number } | null {
  if (live && cloud) {
    return when(live) >= cloudWhen(cloud) ? { sample: live, at: when(live) } : { sample: cloud, at: cloudWhen(cloud) }
  }
  if (live) return { sample: live, at: when(live) }
  if (cloud) return { sample: cloud, at: cloudWhen(cloud) }
  return null
}

/** The newest real device report, live preferred on a tie. */
export function newestAcSample(
  cloud?: AcSample | null,
  live?: AcSample | null,
): AcSample | null {
  return newest(cloud, live)?.sample ?? null
}

export function resolveAcOutput({ connected, cloud, live, command }: AcOutputSources): AcOutputView {
  if (command?.status === 'sending') return { on: command.on, known: true, pending: true }
  if (!connected) return { on: false, known: false, pending: false }

  const device = newest(cloud, live)
  if (command && !(device && device.at > command.at)) {
    return { on: command.on, known: true, pending: false }
  }
  if (device) return { on: device.sample.on, known: true, pending: false }
  return { on: false, known: false, pending: false }
}

/** A sent command the device has since answered can be dropped. */
export function commandSuperseded(command: AcCommand | null | undefined, sources: Omit<AcOutputSources, 'command'>): boolean {
  if (!command || command.status === 'sending') return false
  const device = newest(sources.cloud, sources.live)
  return !!device && device.at > command.at
}
