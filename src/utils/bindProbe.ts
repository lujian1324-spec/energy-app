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
import { stationPlace, currencyFor, countryName } from './stationLocation'
import { fetchStationDictionary, fetchStationList, reverseMyIpRegion, reverseGisRegion } from '../api/deviceApi'

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

/**
 * A full StationAddDtio — the documented standalone create.
 *
 * `lat`/`lng` are passed rather than taken from stationPlace so the sweep can
 * test 0,0 against a real location: the vendor's form picks the point off a map,
 * and 0,0 is what this app was sending.
 */
export function fullStation(name: string, capacityKw: number, lat: number, lng: number) {
  const p = stationPlace()
  return {
    name: name.slice(0, 40),
    country: p.country,
    province: p.city,
    city: p.city,
    area: p.area,
    address: p.address,
    latitude: lat,
    longitude: lng,
    stationType: 0,
    connectedGridType: 0,
    installedCapacity: Math.max(capacityKw, 0.001),
    installedAt: new Date().toISOString(),
    timezone: p.timezone,
    currencyCode: currencyFor(p.country),
  }
}

/**
 * Station bodies that differ in the three values every previous attempt held
 * constant, because they were copied from a doc example and never questioned:
 * the enums (0 may be a placeholder, not a member), the name (it carries a
 * middle dot), and the install time (ISO with milliseconds, where the vendor's
 * own form collects a plain date).
 */
export function stationVariants(
  name: string,
  capacityKw: number,
  region?: { country?: string; province?: string; city?: string },
): Array<{ label: string; body: Record<string, unknown> }> {
  const p = stationPlace()
  const cap = Math.max(capacityKw, 0.001)
  const plain = name.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim() || 'My Station'
  const dateOnly = new Date().toISOString().slice(0, 10)

  /** The endpoint's own request example, key for key. */
  const example = (over: Record<string, unknown> = {}) => ({
    name: name.slice(0, 40),
    latitude: p.latitude,
    longitude: p.longitude,
    installedCapacity: cap,
    connectedGridType: 2,
    country: countryName(p.country),
    city: p.city,
    ...over,
  })

  const variants: Array<{ label: string; body: Record<string, unknown> }> = []

  // The platform's own words for where we are beat anything invented here.
  if (region?.country) {
    variants.push(
      { label: 'platform region · country', body: example({ country: region.country, city: region.city ?? p.city }) },
      { label: 'platform region · country + province + city', body: example({
        country: region.country, province: region.province, city: region.city ?? p.city }) },
      { label: 'platform region · with valid enums', body: example({
        country: region.country, city: region.city ?? p.city, stationType: 1, connectedGridType: 2 }) },
    )
  }

  // "China" exactly — the endpoint's example says so, and every run so far has
  // sent "China mainland" (Intl's name on iOS) or the bare code instead.
  variants.push(
    { label: 'country exactly as the example writes it', body: example({ country: 'China' }) },
    { label: 'country as the example + valid enums', body: example({ country: 'China', stationType: 1, connectedGridType: 2 }) },
  )

  return [
    ...variants,
    { label: 'example, as published', body: example() },
    { label: 'example + plain ASCII name', body: example({ name: plain }) },
    { label: 'example + ISO country code', body: example({ country: p.country }) },
    { label: 'example + connectedGridType 1', body: example({ connectedGridType: 1 }) },
    { label: 'example + connectedGridType 0', body: example({ connectedGridType: 0 }) },
    { label: 'example + stationType 1', body: example({ stationType: 1 }) },
    { label: 'example + stationType 0', body: example({ stationType: 0 }) },
    { label: 'example + timezone + currency', body: example({ timezone: p.timezone, currencyCode: currencyFor(p.country) }) },
    { label: 'example + installedAt (date only)', body: example({ installedAt: dateOnly }) },
    { label: 'example + address fields', body: example({ province: p.city, area: p.area, address: p.address }) },
    { label: 'example, capacity 10.5 as published', body: example({ installedCapacity: 10.5 }) },
    { label: 'everything: name plain, all optionals', body: example({
      name: plain, stationType: 1, province: p.city, area: p.area, address: p.address,
      installedAt: dateOnly, timezone: p.timezone, currencyCode: currencyFor(p.country),
    }) },
    { label: 'the ten-field body that was refused (control)', body: {
      name: name.slice(0, 40), country: p.country, province: p.city, city: p.city,
      area: p.area, address: p.address, latitude: p.latitude, longitude: p.longitude,
      stationType: 0, connectedGridType: 0, installedCapacity: cap,
      installedAt: new Date().toISOString(), timezone: p.timezone,
      currencyCode: currencyFor(p.country),
    } },
  ]
}

/** The same station with no address fields at all — what this app used to send. */
export function bareStation(name: string, capacityKw: number, lat: number, lng: number) {
  const full = fullStation(name, capacityKw, lat, lng)
  const { province: _p, city: _c, area: _a, address: _ad, ...rest } = full
  return { ...rest, country: 'US', currencyCode: 'USD' }
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
  const place = stationPlace()
  const kwOn = { kw: true, emptyStrings: true, virtual: !i.reportedSerial }
  const wOn = { kw: false, emptyStrings: true, virtual: !i.reportedSerial }

  const twoStep = (
    label: string, lat: number, lng: number, dev: typeof kwOn,
    station: (n: string, c: number, la: number, lo: number) => Record<string, unknown> = fullStation,
  ): ProbeVariant => ({
    label,
    stepCount: 2,
    steps: (prev) => {
      if (prev === undefined) {
        return {
          label: 'create station',
          path: '/station/add',
          body: station(i.deviceName, i.ratedPowerW / 1000, lat, lng),
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
    // The vendor's form requires address, city and area and picks the point off
    // a map, so the located station goes first.
    twoStep('two-step · located station · kW', place.latitude, place.longitude, kwOn),
    twoStep('two-step · located station · watts', place.latitude, place.longitude, wOn),
    twoStep('two-step · located station, 0,0 coords · kW', 0, 0, kwOn),
    twoStep('two-step · no address fields, real coords · kW', LAT, LNG, kwOn, bareStation),
    twoStep('two-step · no address fields, 0,0 · kW', 0, 0, kwOn, bareStation),

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

  /*
   * Before sending anything: what does the server say the valid values ARE, and
   * what does a station it accepted actually look like? /station/add refuses
   * every body this app builds, so the answer is more likely in what we are
   * guessing at — the two enums — than in another shape.
   */
  try {
    const dict = await fetchStationDictionary()
    emit({ variant: 'lookup', step: 'station dictionary', path: '/dictionary/data/station',
      body: '', code: String(dict.code), message: JSON.stringify(dict.data ?? dict.message ?? '').slice(0, 1500),
      ok: isApiSuccess(dict.code) })
  } catch (e) {
    emit({ variant: 'lookup', step: 'station dictionary', path: '/dictionary/data/station',
      body: '', code: 'threw', message: e instanceof Error ? e.message : String(e), ok: false })
  }
  let region: { country?: string; province?: string; city?: string } | undefined
  for (const [label, path, call] of [
    ['region from my IP', '/admin/region/coding/reverse/myip', () => reverseMyIpRegion()],
    ['region from coordinates', '/admin/region/coding/reverse', () => reverseGisRegion(stationPlace().latitude, stationPlace().longitude)],
  ] as Array<[string, string, () => Promise<ApiResponse<unknown>>]>) {
    try {
      const r = await call()
      emit({ variant: 'lookup', step: label, path, body: '', code: String(r.code),
        message: JSON.stringify(r.data ?? r.message ?? '').slice(0, 800), ok: isApiSuccess(r.code) })
      if (isApiSuccess(r.code) && r.data && typeof r.data === 'object' && !region) {
        const d = r.data as Record<string, unknown>
        const pick = (...k: string[]) => {
          for (const key of k) { const v = d[key]; if (typeof v === 'string' && v) return v }
          return undefined
        }
        region = {
          country: pick('country', 'countryName', 'nation'),
          province: pick('province', 'provinceName', 'state'),
          city: pick('city', 'cityName'),
        }
        if (!region.country) region = undefined
      }
    } catch (e) {
      emit({ variant: 'lookup', step: label, path, body: '', code: 'threw',
        message: e instanceof Error ? e.message : String(e), ok: false })
    }
  }

  try {
    const list = await fetchStationList(1, 5)
    emit({ variant: 'lookup', step: 'existing stations', path: '/station/list',
      body: '', code: String(list.code), message: JSON.stringify(list.data ?? '').slice(0, 1500),
      ok: isApiSuccess(list.code) })
  } catch (e) {
    emit({ variant: 'lookup', step: 'existing stations', path: '/station/list',
      body: '', code: 'threw', message: e instanceof Error ? e.message : String(e), ok: false })
  }

  // Then the station bodies, since /station/add is where it stops.
  for (const v of stationVariants(input.deviceName, input.ratedPowerW / 1000, region)) {
    let res: ApiResponse<unknown> | null = null
    try {
      res = await api.post<unknown>('/station/add', v.body)
    } catch (e) {
      emit({ variant: `station · ${v.label}`, step: 'create station', path: '/station/add',
        body: JSON.stringify(v.body), code: 'threw',
        message: e instanceof Error ? e.message : String(e), ok: false })
      continue
    }
    const ok = isApiSuccess(res.code)
    emit({ variant: `station · ${v.label}`, step: 'create station', path: '/station/add',
      body: JSON.stringify(v.body), code: String(res.code), message: String(res.message ?? ''), ok })
    if (ok) {
      // A station exists now; add the device into it and stop.
      const stationId = res.data == null ? null : String(res.data)
      if (stationId && stationId !== 'null') {
        const add = await api.post<unknown>('/device/add/single', {
          ...deviceBody(input, { kw: true, emptyStrings: true, virtual: !input.reportedSerial }),
          stationId,
        }).catch(() => null)
        emit({ variant: `station · ${v.label}`, step: `add device to station ${stationId}`,
          path: '/device/add/single', body: '', code: String(add?.code ?? 'threw'),
          message: String(add?.message ?? ''), ok: !!add && isApiSuccess(add.code) })
        if (add && isApiSuccess(add.code)) return { lines, winner: `station · ${v.label}` }
      }
      return { lines, winner: `station created · ${v.label} (device add still pending)` }
    }
  }

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
