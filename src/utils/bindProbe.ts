/**
 * One tap, every candidate.
 *
 * Adding a device to an account with no power station has been refused with
 * 20101 "Iillegal argument" through four separate attempts, each of which
 * changed one thing and cost a release to find out. The variables are few enough
 * to enumerate, so this sends them all and reports which one the server accepts,
 * instead of spending another build per guess.
 *
 * It stops at the first success — and that success IS the device being added,
 * which is the outcome wanted anyway. Everything before it is a refusal, which
 * changes nothing on the server.
 *
 * Run from the failure screen, by hand, after an add has already failed.
 */
import { api, isApiSuccess } from './apiClient'
import type { ApiResponse } from './apiClient'

export interface ProbeInput {
  deviceName: string
  dtuDtuid: string
  /** The serial the collector reported, if it reported one. */
  reportedSerial?: string
  /** Fallback serial when the collector reported none. */
  virtualSerial: string
  /** The model's rated power, in watts. */
  ratedPowerW: number
}

export interface ProbeStep {
  label: string
  path: string
  body: Record<string, unknown>
}

export interface ProbeVariant {
  label: string
  /** Runs in order; a step may use what an earlier one returned. */
  steps: (prev: unknown) => ProbeStep | null
  stepCount: number
}

function timezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

/** A full StationAddDtio — the documented standalone create. */
export function fullStation(name: string, capacityKw: number, lat: number, lng: number) {
  return {
    name: name.slice(0, 40),
    country: 'US',
    latitude: lat,
    longitude: lng,
    stationType: 0,
    connectedGridType: 0,
    installedCapacity: Math.max(capacityKw, 0.001),
    installedAt: new Date().toISOString(),
    timezone: timezone(),
    currencyCode: 'USD',
  }
}

/** The device half, shared by every variant. */
function deviceBody(i: ProbeInput, opts: {
  kw: boolean
  emptyStrings: boolean
  virtual: boolean
}): Record<string, unknown> {
  const serial = opts.virtual ? i.virtualSerial : (i.reportedSerial ?? i.virtualSerial)
  const b: Record<string, unknown> = {
    deviceName: i.deviceName,
    deviceSerialNumber: serial,
    dtuDtuid: i.dtuDtuid,
    ratedPower: opts.kw ? i.ratedPowerW / 1000 : i.ratedPowerW,
    isVirtualSerialNumber: opts.virtual,
  }
  if (opts.emptyStrings) { b.installVendor = ''; b.installedAt = '' }
  return b
}

/**
 * Every combination worth sending, cheapest and most likely first.
 *
 * The two shanghai-ish coordinates are only there because the platform's own
 * example carries a real location and ours sends 0,0 — the one field-level
 * difference left after the example was matched key for key.
 */
export function buildVariants(i: ProbeInput): ProbeVariant[] {
  const LAT = 31.2304, LNG = 121.4737
  const kwOn = { kw: true, emptyStrings: true, virtual: !i.reportedSerial }
  const wOn = { kw: false, emptyStrings: true, virtual: !i.reportedSerial }

  const twoStep = (label: string, lat: number, lng: number, dev: typeof kwOn): ProbeVariant => ({
    label,
    stepCount: 2,
    steps: (prev) => {
      if (prev === undefined) {
        return {
          label: 'create station',
          path: '/station/add',
          body: fullStation(i.deviceName, i.ratedPowerW / 1000, lat, lng),
        }
      }
      const stationId = prev == null ? null : String(prev)
      if (!stationId || stationId === 'null') return null
      return {
        label: `add device to station ${stationId}`,
        path: '/device/add/single',
        body: { ...deviceBody(i, dev), stationId },
      }
    },
  })

  const together = (label: string, station: Record<string, unknown>, dev: typeof kwOn): ProbeVariant => ({
    label,
    stepCount: 1,
    steps: (prev) => prev !== undefined ? null : ({
      label: 'add device + station',
      path: '/device/add/single/addStationTogether',
      body: { ...deviceBody(i, dev), station },
    }),
  })

  return [
    // Two documented calls. /device/add/single with a real station id is the
    // path that demonstrably works on an account that already has one.
    twoStep('two-step · station 0,0 · kW', 0, 0, kwOn),
    twoStep('two-step · station real coords · kW', LAT, LNG, kwOn),
    twoStep('two-step · station real coords · watts', LAT, LNG, wOn),

    // The combined call, through every station shape that has been suggested.
    together('together · station {name,lat,lng} real coords · kW',
      { name: i.deviceName.slice(0, 40), latitude: LAT, longitude: LNG }, kwOn),
    together('together · station {name,lat,lng} 0,0 · kW',
      { name: i.deviceName.slice(0, 40), latitude: 0, longitude: 0 }, kwOn),
    together('together · station {name,lat,lng} real coords · watts',
      { name: i.deviceName.slice(0, 40), latitude: LAT, longitude: LNG }, wOn),
    together('together · full StationAddDtio real coords · kW',
      fullStation(i.deviceName, i.ratedPowerW / 1000, LAT, LNG), kwOn),
    together('together · station {name} only · kW',
      { name: i.deviceName.slice(0, 40) }, kwOn),

    // Last: the device fields themselves.
    together('together · no empty strings · kW',
      { name: i.deviceName.slice(0, 40), latitude: LAT, longitude: LNG },
      { kw: true, emptyStrings: false, virtual: !i.reportedSerial }),
    together('together · virtual serial · kW',
      { name: i.deviceName.slice(0, 40), latitude: LAT, longitude: LNG },
      { kw: true, emptyStrings: true, virtual: true }),
  ]
}

export interface ProbeLine {
  variant: string
  step: string
  path: string
  body: string
  code: string
  message: string
  ok: boolean
}

export interface ProbeResult {
  lines: ProbeLine[]
  winner: string | null
}

/**
 * Sends each variant until one is accepted. Returns every line either way, so a
 * run that finds nothing is still worth reading — the replies differ.
 */
export async function runBindProbe(
  input: ProbeInput,
  onLine?: (l: ProbeLine) => void,
): Promise<ProbeResult> {
  const lines: ProbeLine[] = []
  const emit = (l: ProbeLine) => { lines.push(l); onLine?.(l) }

  for (const variant of buildVariants(input)) {
    let prev: unknown = undefined
    let variantOk = false

    for (let n = 0; n < variant.stepCount; n++) {
      const step = variant.steps(prev)
      if (!step) break

      let res: ApiResponse<unknown> | null = null
      try {
        res = await api.post<unknown>(step.path, step.body)
      } catch (e) {
        emit({
          variant: variant.label, step: step.label, path: step.path,
          body: JSON.stringify(step.body),
          code: 'threw', message: e instanceof Error ? e.message : String(e), ok: false,
        })
        break
      }

      const ok = isApiSuccess(res.code)
      emit({
        variant: variant.label, step: step.label, path: step.path,
        body: JSON.stringify(step.body),
        code: String(res.code), message: String(res.message ?? ''), ok,
      })
      if (!ok) break

      prev = res.data
      variantOk = n === variant.stepCount - 1
    }

    // A win means the device is on the account — nothing left to try.
    if (variantOk) return { lines, winner: variant.label }
  }

  return { lines, winner: null }
}

/** The whole run as one block of text, for pasting into a bug report. */
export function formatProbe(r: ProbeResult): string {
  const out = r.lines.map(l =>
    `${l.ok ? 'OK  ' : 'FAIL'} ${l.variant}\n     ${l.step} → POST ${l.path}\n     ${l.body}\n     code=${l.code} msg=${l.message}`)
  out.push(r.winner ? `WINNER: ${r.winner}` : 'no variant succeeded')
  return out.join('\n')
}
