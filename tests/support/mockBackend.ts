/**
 * An in-memory Solar of Things backend for the E2E specs.
 *
 * Every request the app makes to `solar.siseli.com` is answered from `devices`
 * below, and every other off-box host is stubbed, so no spec can reach a real
 * account, device, relay or font server. Each call is recorded in `calls` for
 * the specs to assert on.
 *
 * Only runs against a local build (E2E_LOCAL=1): the live site talks to the
 * real backend and cannot be signed in without credentials.
 */
import type { Page, Route } from '@playwright/test'
import { createHash } from 'node:crypto'

export const API_HOST = 'solar.siseli.com'

/** The one password `/login/account` accepts; the app must send its MD5, never the text. */
export const MOCK_PASSWORD = 'Sierro-e2e-123'
const MOCK_PASSWORD_MD5 = createHash('md5').update(MOCK_PASSWORD).digest('hex')

/** Fields the device reports at time `t` (ms), or null when it sent nothing. */
export type HistoryModel = (t: number) => Record<string, number> | null

export interface MockDevice {
  id: string
  name: string
  model?: string
  isOnline?: boolean
  createdAt?: string
  /** AC outlets on (0x0126 bit 2 and the cloud `acOutputs`). */
  acOn?: boolean
  /** When false the device takes the 0x0080 write but never switches. */
  acObeys?: boolean
  soc?: number
  /** `key`s of firing alarms, e.g. 'inverterOverload'. */
  alarms?: string[]
  history?: HistoryModel
  /** 1-based page numbers of the history endpoint that answer an error. */
  failHistoryPages?: number[]
  /** The DTU id the device was bound with (read over Bluetooth at add time). */
  dtuDtuid?: string
  /** The record's serial; `isVirtualSerialNumber` marks one the app generated at bind time. */
  serialNumber?: string
  isVirtualSerialNumber?: boolean
  /** The cloud `workMode` field (1 Backup / 2 Savings); nothing the app does changes it. */
  workMode?: number
  /** When true every passthrough register write answers 20101 "illegal argument". */
  refuseRegisterWrites?: boolean
  /** When true the platform answers keys/history/v1 with 20101 (app falls back to record/list). */
  refuseKeysV1?: boolean
}

export interface ApiCall {
  path: string
  query: Record<string, string>
  body: any
  headers: Record<string, string>
}

export interface MockBackend {
  devices: MockDevice[]
  calls: ApiCall[]
  /** Calls to one path, optionally for one device. */
  callsTo(path: string, deviceId?: string): ApiCall[]
}

// ─── Modbus RTU framing (FC03 replies, FC06 writes) ─────────────────────────

function crc16(bytes: number[]): number {
  let crc = 0xffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1
  }
  return crc
}

/** FC03 reply carrying `registers`, base64 like the real passthrough. */
function readReply(registers: number[]): string {
  const bytes = [0x01, 0x03, registers.length * 2]
  for (const r of registers) bytes.push((r >> 8) & 0xff, r & 0xff)
  const crc = crc16(bytes)
  bytes.push(crc & 0xff, crc >> 8)
  return Buffer.from(bytes).toString('base64')
}

/** READ_ALL_STATUS (0x0100 × 0x38) for one device. */
function statusRegisters(d: MockDevice): number[] {
  const regs = new Array(0x38).fill(0)
  regs[0x04] = 120 // output W
  regs[0x06] = 50  // solar W
  regs[0x07] = 100 // AC W
  regs[0x1a] = (d.soc ?? 80) * 10
  regs[0x23] = 250 // 25.0 °C
  regs[0x26] = d.acOn ? 1 << 2 : 0
  return regs
}

// ─── Signed-in session ──────────────────────────────────────────────────────

/**
 * Start the page signed in, the way a returning user opens the app: tokens in
 * storage and `iot-auth` persisted. `restoreSession` then verifies against the
 * mock's /user/select/iotUserInfo.
 */
export async function signIn(page: Page, userId = '491513787113766912'): Promise<void> {
  await page.addInitScript((uid) => {
    if (sessionStorage.getItem('e2e-signed-in')) return
    sessionStorage.setItem('e2e-signed-in', '1')
    localStorage.setItem('iot_access_token', 'E2E-ACCESS')
    localStorage.setItem('iot_refresh_token', 'E2E-REFRESH')
    localStorage.setItem('iot_user_id', uid)
    localStorage.setItem('iot-auth', JSON.stringify({ state: { isAuthenticated: true, user: null }, version: 0 }))
    // The first-visit "turn on notifications" sheet would cover the list.
    localStorage.setItem('sierro-enable-noti-seen', '1')
  }, userId)
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * `accounts` maps a sign-in address to its userId for the email-code sign-in
 * (`/login/email`); any code is accepted.
 */
export async function mockBackend(
  page: Page,
  devices: MockDevice[],
  accounts: Record<string, string> = {},
): Promise<MockBackend> {
  const calls: ApiCall[] = []
  let signedInEmail = 'e2e@example.com'
  const byId = (id: unknown) => devices.find(d => d.id === String(id))

  // Anything that is not the local build or the API is stubbed: fonts, the
  // push relay, marketing links.
  await page.route(url => {
    const u = new URL(url)
    return u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== API_HOST
  }, route => route.fulfill({ status: 200, body: '', contentType: 'text/plain' }))

  await page.route(url => new URL(url).hostname === API_HOST, async (route: Route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/apis/, '')
    const query = Object.fromEntries(url.searchParams)
    let body: any = null
    try { body = req.postDataJSON() } catch { body = req.postData() }
    calls.push({ path, query, body, headers: req.headers() })
    const ok = (data: unknown) => route.fulfill({ json: { code: 0, message: 'success', data } })

    switch (path) {
      case '/user/send/email/captcha':
        return ok({ iotCaptchaId: 'E2E-CAPTCHA' })

      case '/login/account': {
        const acct = String(body?.account ?? '')
        if (body?.password !== MOCK_PASSWORD_MD5) {
          return route.fulfill({ json: { code: 10002, message: 'Account or password error' } })
        }
        signedInEmail = acct.includes('@') ? acct : `${acct}@example.com`
        const userId = accounts[acct.toLowerCase()] ?? '491513787113760001'
        return ok({
          accessToken: `E2E-ACCESS-${userId}`, refreshToken: `E2E-REFRESH-${userId}`,
          accessTokenWillExpiredInMillis: 86_400_000, userId, account: acct,
        })
      }

      case '/login/email': {
        signedInEmail = String(body?.email ?? '')
        const userId = accounts[signedInEmail.toLowerCase()] ?? '491513787113760000'
        return ok({
          accessToken: `E2E-ACCESS-${userId}`, refreshToken: `E2E-REFRESH-${userId}`,
          accessTokenWillExpiredInMillis: 86_400_000, userId, account: signedInEmail.split('@')[0], email: signedInEmail,
        })
      }

      case '/user/select/iotUserInfo':
        return ok({ id: '1', name: 'E2E User', email: signedInEmail, createdAt: '2025-01-01 00:00:00', lastLoginTime: '2026-01-01 00:00:00' })

      case '/device/list':
        return ok({
          list: devices.map(d => ({
            id: d.id, name: d.name, model: d.model ?? 'Sierro 2000', isOnline: d.isOnline ?? true,
            createdAt: d.createdAt ?? '2026-01-01T00:00:00Z', installedAt: d.createdAt ?? '2026-01-01T00:00:00Z',
            serialNumber: d.serialNumber ?? `SN${d.id}`, isVirtualSerialNumber: d.isVirtualSerialNumber ?? false,
            dtuDtuid: d.dtuDtuid ?? '',
          })),
          total: devices.length, page: 1, count: 20,
        })

      case '/device/details': {
        const d = byId(query.deviceId)
        return ok(d ? { id: d.id, name: d.name, model: d.model ?? 'Sierro 2000', isOnline: d.isOnline ?? true } : null)
      }

      case '/remote/device/state/latest': {
        const d = byId(query.deviceId)
        if (!d) return route.fulfill({ json: { code: 1, message: 'no such device' } })
        const v = (n: number | boolean) => ({ value: typeof n === 'boolean' ? (n ? '1' : '0') : String(n) })
        return ok({
          deviceId: d.id,
          time: String(Math.floor(Date.now() / 1000)),
          fields: {
            remainingBatteryCapacity: v(d.soc ?? 80),
            exchangeChargingPower: v(100), generationPower: v(50), outputPower: v(120),
            acOutputs: v(!!d.acOn),
            ...(d.workMode !== undefined ? { workMode: v(d.workMode) } : {}),
          },
          firingAlarms: (d.alarms ?? []).map((key, i) => ({
            alarmId: `${d.id}-${i}`, alarmCode: key, key, alarmMessage: '', severity: 'warning',
            timestamp: new Date().toISOString(),
          })),
        })
      }

      case '/remote/device/passthrough': {
        const d = byId(query.deviceId)
        if (!d || d.isOnline === false) return route.fulfill({ json: { code: 1, message: 'device offline' } })
        const frame = [...Buffer.from(String(body?.base64Input ?? ''), 'base64')]
        const fn = frame[1]
        const reg = (frame[2] << 8) | frame[3]
        const value = (frame[4] << 8) | frame[5]
        if (d.refuseRegisterWrites && (fn === 0x06 || fn === 0x10)) {
          return route.fulfill({ json: { code: 20101, message: 'illegal argument' } })
        }
        if (fn === 0x06 && reg === 0x0080) {
          if (d.acObeys !== false) {
            if (value === 0x01aa) d.acOn = true
            if (value === 0xaa01) d.acOn = false
          }
          return ok({ base64Output: Buffer.from(frame).toString('base64') })
        }
        if (fn === 0x03 && reg === 0x0100) return ok({ base64Output: readReply(statusRegisters(d)) })
        if (fn === 0x03) return ok({ base64Output: readReply(new Array((frame[4] << 8) | frame[5]).fill(0)) })
        return ok({ base64Output: Buffer.from(frame).toString('base64') })
      }

      case '/deviceState/simple/attribute/keys/history/v1': {
        // The console's call: columnar reply (siseli-history-api-handoff).
        const d = byId(body?.deviceId)
        const offset = /[+-]\d{2}:\d{2}$|Z$/
        if (!d || d.refuseKeysV1 || !offset.test(body.fromTime) || !offset.test(body.toTime)) {
          return route.fulfill({ json: { code: 20101, message: 'illegal argument' } })
        }
        if (d.failHistoryPages?.includes(body.page)) {
          return route.fulfill({ json: { code: 500, message: 'server busy' } })
        }
        const keys: string[] = body.keys ?? []
        const frames = frameTimes(d, Date.parse(body.fromTime), Date.parse(body.toTime))
        const pages = Math.max(1, Math.ceil(frames.length / body.count))
        const slice = frames.slice((body.page - 1) * body.count, body.page * body.count)
        return ok({
          page: body.page, count: slice.length, total: pages,
          payload: {
            timeSeries: slice.map(f => new Date(f.t).toISOString()),
            fields: Object.fromEntries(keys.map(k => [k, slice.map(f => f.fields[k] ?? null)])),
            formatters: {}, fieldInfo: null,
          },
        })
      }

      case '/deviceState/attribute/record/list': {
        const d = byId(body?.deviceId)
        const offset = /[+-]\d{2}:\d{2}$|Z$/
        // The real backend answers a malformed time with 20101.
        if (!d || !offset.test(body.fromTime) || !offset.test(body.toTime)) {
          return route.fulfill({ json: { code: 20101, message: 'illegal argument' } })
        }
        if (d.failHistoryPages?.includes(body.page)) {
          return route.fulfill({ json: { code: 500, message: 'server busy' } })
        }
        const from = Date.parse(body.fromTime)
        const to = Date.parse(body.toTime)
        const all: unknown[] = []
        const step = 60_000
        for (let t = Math.ceil(from / step) * step; t <= to && d.history; t += step) {
          const fields = d.history(t)
          if (!fields) continue
          all.push({
            deviceId: d.id,
            time: new Date(t).toISOString(),
            fields: Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, { value: String(val) }])),
          })
        }
        if (body.orderByTimeAsc === false) all.reverse()
        const list = all.slice((body.page - 1) * body.count, body.page * body.count)
        return ok({ list, total: all.length, page: body.page, count: body.count })
      }

      default:
        // Alarms history, stations, profile writes, push registration…
        return ok({ list: [], total: 0 })
    }
  })

  function frameTimes(d: MockDevice, from: number, to: number) {
    const out: Array<{ t: number; fields: Record<string, number> }> = []
    const step = 60_000
    for (let t = Math.ceil(from / step) * step; t <= to && d.history; t += step) {
      const fields = d.history(t)
      if (fields) out.push({ t, fields })
    }
    return out
  }

  return {
    devices,
    calls,
    callsTo: (path, deviceId) => calls.filter(c => c.path === path &&
      (deviceId === undefined || String(c.query.deviceId ?? c.body?.deviceId) === deviceId)),
  }
}

/**
 * The zone the specs run the browser in: west of UTC, where the old history
 * request lost its minus sign. The mock reads hours in the same zone.
 */
export const E2E_TZ = 'America/Los_Angeles'

const hourMinute = new Intl.DateTimeFormat('en-US', { timeZone: E2E_TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })

/** Hour and minute of `t` in E2E_TZ. */
export function localHM(t: number): { h: number; m: number } {
  const parts = hourMinute.formatToParts(new Date(t))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  return { h: get('hour'), m: get('minute') }
}

/** A model that reports every `everyMin` minutes between E2E_TZ hours [fromHour, toHour). */
export function reportsBetween(
  fromHour: number, toHour: number, fields: Record<string, number>, everyMin = 5,
): HistoryModel {
  return (t) => {
    const { h, m } = localHM(t)
    if (h < fromHour || h >= toHour) return null
    return m % everyMin === 0 ? fields : null
  }
}
