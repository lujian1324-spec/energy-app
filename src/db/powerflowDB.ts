/**
 * PowerFlow IndexedDB 数据库
 * 使用 idb 库封装，提供类型安全的 CRUD 操作
 *
 * 数据库名称: powerflow-db 版本: 2
 * ObjectStore 列表:
 * - power_history 功率历史 (自增 id, timestamp 索引)
 * - alerts 告警日志 (自增 id, timestamp/resolved 索引)
 * - connection_logs  连接历史 (自增 id)
 * - commands 命令审计 (自增 id)
 * - user_profile 用户资料 (key: 'account:<account>')
 * - device_history 云端历史缓存 (key: [deviceId, timestamp], v5)
 * - history_days   哪些天已缓存、是否完整 (key: [deviceId, dayStart], v6 — Insights 预缓存)
 */

import { openDB, type IDBPDatabase } from 'idb'
import type {
  PowerHistoryRecord,
  AlertRecord,
  ConnectionRecord,
  CommandRecord,
  PowerHistoryQuery,
  AlertQuery,
  UserProfile,
} from '../types/protocol'
import type { PeakShavingSettings } from '../types'
import type { HistoryPoint } from '../utils/historyPoints'

const DB_NAME = 'powerflow-db'
const DB_VERSION = 6   // v5: device_history (per-device cloud history cache); v6: history_days

export interface RatedParams {
  deviceId: string
  acInvOutputPower: number  // 交流逆变输出功率 (W), register 0x000A
  fetchedAt: number         // unix ms
  // ── 型号默认参数（新增设备时按所选型号写入；BLE 抓到的实参可覆盖 acInvOutputPower）──
  model?: string
  ratedPower?: number         // 额定功率 W
  ratedChargePower?: number   // 额定充电功率 W
  batteryType?: string        // 电池类型，如 LFP
  batteryHealth?: number      // 电池健康度 %
  serialNumber?: string       // 自动生成的序列号
  /** The DTU id read over Bluetooth when this device was added (Device Info's Bluetooth ID). */
  bleId?: string
  /** Where `model` came from: 0x000A at add time, the default, or the user's pick (v4.18.0). */
  modelSource?: 'detected' | 'default' | 'user'
}

/**
 * One cached cloud sample. Keyed by [deviceId, timestamp], so a device can
 * never read another's rows and re-writing a sample replaces it.
 */
export interface DeviceHistoryRow extends HistoryPoint {
  deviceId: string
}

/**
 * One local day of one device's history in `device_history` (v6, Insights cache).
 * `final`: read after the day was over and settled, so it is never read again.
 * A day without a row has not been cached (or was trimmed) and must be fetched.
 */
export interface HistoryDayRow {
  deviceId: string
  dayStart: number
  fetchedAt: number
  final: boolean
}

/** 最大保留条数（避免无限增长） */
/** ~a month at a one-minute cadence for three devices (v4.21.0 Insights cache). */
const MAX_DEVICE_HISTORY = 150_000
const MAX_POWER_HISTORY = 8640 // ~24h @ 10s interval
const MAX_ALERTS = 500
const MAX_COMMANDS = 200

type PowerFlowDB = IDBPDatabase<{
  power_history: {
    key: number
    value: PowerHistoryRecord
    indexes: { timestamp: number }
  }
  alerts: {
    key: number
    value: AlertRecord
    indexes: { timestamp: number; resolved: number }
  }
  connection_logs: {
    key: number
    value: ConnectionRecord
    indexes: { timestamp: number }
  }
  commands: {
    key: number
    value: CommandRecord
    indexes: { timestamp: number }
  }
  user_profile: {
    key: string
    value: UserProfile
  }
  smart_schedule: {
    key: string
    value: PeakShavingSettings
  }
  rated_params: {
    key: string
    value: RatedParams
  }
  device_history: {
    key: [string, number]
    value: DeviceHistoryRow
    indexes: { timestamp: number }
  }
  history_days: {
    key: [string, number]
    value: HistoryDayRow
  }
}>

let _db: PowerFlowDB | null = null

async function getDB(): Promise<PowerFlowDB> {
  if (_db) return _db

  _db = await openDB<{
    power_history: {
      key: number
      value: PowerHistoryRecord
      indexes: { timestamp: number }
    }
    alerts: {
      key: number
      value: AlertRecord
      indexes: { timestamp: number; resolved: number }
    }
    connection_logs: {
      key: number
      value: ConnectionRecord
      indexes: { timestamp: number }
    }
    commands: {
      key: number
      value: CommandRecord
      indexes: { timestamp: number }
    }
    user_profile: {
      key: string
      value: UserProfile
    }
    smart_schedule: {
      key: string
      value: PeakShavingSettings
    }
    rated_params: {
      key: string
      value: RatedParams
    }
    device_history: {
      key: [string, number]
      value: DeviceHistoryRow
      indexes: { timestamp: number }
    }
    history_days: {
      key: [string, number]
      value: HistoryDayRow
    }
  }>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      // ---- power_history ----
      if (!db.objectStoreNames.contains('power_history')) {
        const store = db.createObjectStore('power_history', {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('timestamp', 'timestamp')
      }

      // ---- alerts ----
      if (!db.objectStoreNames.contains('alerts')) {
        const store = db.createObjectStore('alerts', {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('timestamp', 'timestamp')
        store.createIndex('resolved', 'resolved')
      }

      // ---- connection_logs ----
      if (!db.objectStoreNames.contains('connection_logs')) {
        const store = db.createObjectStore('connection_logs', {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('timestamp', 'timestamp')
      }

      // ---- commands ----
      if (!db.objectStoreNames.contains('commands')) {
        const store = db.createObjectStore('commands', {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('timestamp', 'timestamp')
      }

      // ---- user_profile (added in v2) ----
      if (!db.objectStoreNames.contains('user_profile')) {
        db.createObjectStore('user_profile')
      }

      // ---- smart_schedule (added in v3, T10) ----
      if (!db.objectStoreNames.contains('smart_schedule')) {
        db.createObjectStore('smart_schedule')
      }

      // ---- rated_params (added in v4) ----
      if (!db.objectStoreNames.contains('rated_params')) {
        db.createObjectStore('rated_params')
      }

      // ---- device_history (added in v5) ----
      if (!db.objectStoreNames.contains('device_history')) {
        const store = db.createObjectStore('device_history', { keyPath: ['deviceId', 'timestamp'] })
        store.createIndex('timestamp', 'timestamp')
      }
      // ---- history_days (added in v6) ----
      if (!db.objectStoreNames.contains('history_days')) {
        db.createObjectStore('history_days', { keyPath: ['deviceId', 'dayStart'] })
      }
      // The Real-Time Power chart used to cache into power_history, where rows
      // without a deviceId (guest-mode simulator) were read as every device's
      // and AC / battery were stored as 0. Nothing reads it for charts any
      // more; drop what it holds so none of it can surface again.
      if (oldVersion > 0 && oldVersion < 5) {
        void transaction.objectStore('power_history').clear()
      }
    },
  })

  return _db
}

// ================================================================
// 功率历史
// ================================================================

export async function savePowerHistory(record: Omit<PowerHistoryRecord, 'id'>): Promise<void> {
  const db = await getDB()
  await db.add('power_history', record as PowerHistoryRecord)

  // 裁剪旧数据
  const count = await db.count('power_history')
  if (count > MAX_POWER_HISTORY) {
 const tx = db.transaction('power_history', 'readwrite')
 const cursor = await tx.store.openCursor()
 if (cursor) await cursor.delete()
 await tx.done
  }
}

export async function getPowerHistory(query: PowerHistoryQuery = {}): Promise<PowerHistoryRecord[]> {
  const db = await getDB()
  const { from, to, limit = 100 } = query

  const index = db.transaction('power_history').store.index('timestamp')

  let range: IDBKeyRange | undefined
  if (from && to) range = IDBKeyRange.bound(from, to)
  else if (from)  range = IDBKeyRange.lowerBound(from)
  else if (to) range = IDBKeyRange.upperBound(to)

  const results: PowerHistoryRecord[] = []
  let cursor = await index.openCursor(range, 'prev')  // 最新的在前

  while (cursor && results.length < limit) {
 results.push(cursor.value)
 cursor = await cursor.continue()
  }

  return results
}

/** 获取最近 N 分钟的统计摘要 */
export async function getPowerSummary(minutesAgo: number = 60): Promise<{
  avgInput: number
  avgOutput: number
  peakInput: number
  peakOutput: number
  totalInputWh: number
  totalOutputWh: number
  count: number
}> {
  const from = Date.now() - minutesAgo * 60 * 1000
  const records = await getPowerHistory({ from, limit: 1000 })

  if (records.length === 0) {
 return { avgInput: 0, avgOutput: 0, peakInput: 0, peakOutput: 0, totalInputWh: 0, totalOutputWh: 0, count: 0 }
  }

  const avgInput  = records.reduce((s, r) => s + r.inputPower, 0)  / records.length
  const avgOutput = records.reduce((s, r) => s + r.outputPower, 0) / records.length
  const peakInput  = Math.max(...records.map(r => r.inputPower))
  const peakOutput = Math.max(...records.map(r => r.outputPower))

  // 每条记录间隔约 10s → 电量 = 功率(W) * 时间(h)
  const intervalH = 10 / 3600
  const totalInputWh  = records.reduce((s, r) => s + r.inputPower  * intervalH, 0)
  const totalOutputWh = records.reduce((s, r) => s + r.outputPower * intervalH, 0)

  return {
 avgInput:  Math.round(avgInput),
 avgOutput: Math.round(avgOutput),
 peakInput,
 peakOutput,
 totalInputWh:  Math.round(totalInputWh  * 10) / 10,
 totalOutputWh: Math.round(totalOutputWh * 10) / 10,
 count: records.length,
  }
}

// ================================================================
// 告警管理
// ================================================================

export async function addAlert(alert: Omit<AlertRecord, 'id'>): Promise<number> {
  const db = await getDB()
  const id = await db.add('alerts', alert as AlertRecord)

  // 裁剪
  const count = await db.count('alerts')
  if (count > MAX_ALERTS) {
 const tx = db.transaction('alerts', 'readwrite')
 const cursor = await tx.store.openCursor()
 if (cursor) await cursor.delete()
 await tx.done
  }

  return id as number
}

export async function getAlerts(query: AlertQuery = {}): Promise<AlertRecord[]> {
  const db = await getDB()
  const { resolved, limit = 50 } = query

  const allAlerts = await db.getAll('alerts')
  let filtered = allAlerts.reverse()  // 最新在前

  if (resolved !== undefined) {
 filtered = filtered.filter(a => a.resolved === resolved)
  }
  if (query.severity) {
 filtered = filtered.filter(a => a.severity === query.severity)
  }

  return filtered.slice(0, limit)
}

export async function resolveAlert(id: number): Promise<void> {
  const db = await getDB()
  const alert = await db.get('alerts', id)
  if (alert) {
 await db.put('alerts', { ...alert, resolved: true, resolvedAt: Date.now() })
  }
}

export async function getUnresolvedAlertCount(): Promise<number> {
  const db = await getDB()
  const index = db.transaction('alerts').store.index('resolved')
  // IndexedDB boolean → 0/1
  return index.count(IDBKeyRange.only(0))
}

// ================================================================
// 连接日志
// ================================================================

export async function logConnection(record: Omit<ConnectionRecord, 'id'>): Promise<void> {
  const db = await getDB()
  await db.add('connection_logs', record as ConnectionRecord)
}

export async function getConnectionLogs(limit = 20): Promise<ConnectionRecord[]> {
  const db = await getDB()
  const all = await db.getAll('connection_logs')
  return all.reverse().slice(0, limit)
}

// ================================================================
// 命令审计日志
// ================================================================

export async function logCommand(record: Omit<CommandRecord, 'id'>): Promise<void> {
  const db = await getDB()
  await db.add('commands', record as CommandRecord)

  const count = await db.count('commands')
  if (count > MAX_COMMANDS) {
 const tx = db.transaction('commands', 'readwrite')
 const cursor = await tx.store.openCursor()
 if (cursor) await cursor.delete()
 await tx.done
  }
}

export async function getCommandLogs(limit = 30): Promise<CommandRecord[]> {
  const db = await getDB()
  const all = await db.getAll('commands')
  return all.reverse().slice(0, limit)
}

// ================================================================
// T9: 历史功率数据存储模型 — 时间滚动清理（30天保留）
// ================================================================

const POWER_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * 清理超期功率历史数据（保留最近 30 天）
 * 建议在 App 启动时或每小时定时调用
 */
export async function clearOldPowerHistory(): Promise<number> {
  const db = await getDB()
  const cutoff = Date.now() - POWER_HISTORY_RETENTION_MS

  const tx = db.transaction('power_history', 'readwrite')
  const index = tx.store.index('timestamp')
  const range = IDBKeyRange.upperBound(cutoff)

  let cursor = await index.openCursor(range)
  let deleted = 0
  while (cursor) {
    await cursor.delete()
    deleted++
    cursor = await cursor.continue()
  }
  await tx.done

  return deleted
}

/**
 * 清理超期告警数据（保留最近 60 天）
 */
export async function clearOldAlerts(): Promise<number> {
  const ALERT_RETENTION_MS = 60 * 24 * 60 * 60 * 1000 // 60 days
  const db = await getDB()
  const cutoff = Date.now() - ALERT_RETENTION_MS

  const tx = db.transaction('alerts', 'readwrite')
  const index = tx.store.index('timestamp')
  const range = IDBKeyRange.upperBound(cutoff)

  let cursor = await index.openCursor(range)
  let deleted = 0
  while (cursor) {
    await cursor.delete()
    deleted++
    cursor = await cursor.continue()
  }
  await tx.done

  return deleted
}

// ================================================================
// 历史数据批量存储（分页拉取 → 本地缓存）
// ================================================================

/**
 * The cached cloud samples of ONE device in [fromTime, toTime], ascending.
 * Only rows written for this deviceId can come back.
 */
export async function readDeviceHistory(
  deviceId: string,
  fromTime: number,
  toTime: number,
): Promise<HistoryPoint[]> {
  const db = await getDB()
  const rows = await db.getAll('device_history', IDBKeyRange.bound([deviceId, fromTime], [deviceId, toTime]))
  return rows.map(({ deviceId: _d, ...p }) => p)
}

/**
 * Make the cache for this device over [fromTime, toTime] exactly `points`:
 * what the server returned for that window replaces whatever was there.
 */
export async function replaceDeviceHistory(
  deviceId: string,
  fromTime: number,
  toTime: number,
  points: HistoryPoint[],
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('device_history', 'readwrite')
  await tx.store.delete(IDBKeyRange.bound([deviceId, fromTime], [deviceId, toTime]))
  for (const p of points) {
    if (p.timestamp >= fromTime && p.timestamp <= toTime) await tx.store.put({ ...p, deviceId })
  }
  await tx.done
  await trimDeviceHistory()
}

/**
 * Keep the newest MAX_DEVICE_HISTORY samples across all devices. A day that
 * loses rows here loses its `history_days` row too, so it is fetched again
 * instead of being shown short.
 */
async function trimDeviceHistory(): Promise<void> {
  const db = await getDB()
  const excess = (await db.count('device_history')) - MAX_DEVICE_HISTORY
  if (excess <= 0) return
  const tx = db.transaction(['device_history', 'history_days'], 'readwrite')
  const rows = tx.objectStore('device_history')
  let cursor = await rows.index('timestamp').openCursor()
  let newestDropped = -Infinity
  for (let n = 0; cursor && n < excess; n++) {
    newestDropped = Math.max(newestDropped, cursor.value.timestamp)
    await cursor.delete()
    cursor = await cursor.continue()
  }
  const days = tx.objectStore('history_days')
  let day = await days.openCursor()
  while (day) {
    // A day starting before the newest dropped sample may have lost rows.
    if (day.value.dayStart <= newestDropped) await day.delete()
    day = await day.continue()
  }
  await tx.done
}

/** The cached-day rows of one device whose day starts in [fromDay, toDay]. */
export async function readHistoryDays(deviceId: string, fromDay: number, toDay: number): Promise<HistoryDayRow[]> {
  const db = await getDB()
  return db.getAll('history_days', IDBKeyRange.bound([deviceId, fromDay], [deviceId, toDay]))
}

/**
 * One whole local day as the server returned it: its samples replace what the
 * cache held for [dayStart, dayEnd] and the day is recorded as cached, in one
 * transaction — a day is never marked cached without its rows.
 */
export async function saveHistoryDay(
  deviceId: string,
  dayStart: number,
  dayEnd: number,
  points: HistoryPoint[],
  final: boolean,
  fetchedAt = Date.now(),
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['device_history', 'history_days'], 'readwrite')
  const rows = tx.objectStore('device_history')
  await rows.delete(IDBKeyRange.bound([deviceId, dayStart], [deviceId, dayEnd]))
  for (const p of points) {
    if (p.timestamp >= dayStart && p.timestamp <= dayEnd) await rows.put({ ...p, deviceId })
  }
  await tx.objectStore('history_days').put({ deviceId, dayStart, fetchedAt, final })
  await tx.done
  await trimDeviceHistory()
}

/**
 * Record a day whose rows were just written by `replaceDeviceHistory` over that
 * whole day (the Real-Time Power chart reading today), so the Insights cache
 * knows it holds that day.
 */
export async function markHistoryDay(deviceId: string, dayStart: number, fetchedAt: number, final: boolean): Promise<void> {
  const db = await getDB()
  await db.put('history_days', { deviceId, dayStart, fetchedAt, final })
}

/** Drop every cached sample and day older than `cutoff` (all devices). */
export async function pruneDeviceHistoryBefore(cutoff: number): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['device_history', 'history_days'], 'readwrite')
  let cursor = await tx.objectStore('device_history').index('timestamp').openCursor(IDBKeyRange.upperBound(cutoff, true))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  let day = await tx.objectStore('history_days').openCursor()
  while (day) {
    if (day.value.dayStart < cutoff) await day.delete()
    day = await day.continue()
  }
  await tx.done
}

/** Sign-in / sign-out: no account may open on another's cached history. */
export async function clearDeviceHistory(): Promise<void> {
  const db = await getDB()
  await db.clear('device_history')
  await db.clear('history_days')
  await db.clear('power_history')
}

// ================================================================
// 数据库工具
// ================================================================

/** 清除所有历史数据（仅保留 settings） */
export async function clearAllHistory(): Promise<void> {
  const db = await getDB()
  await db.clear('power_history')
  await db.clear('alerts')
  await db.clear('connection_logs')
  await db.clear('commands')
}

/** 获取各 store 的条数统计 */
export async function getDBStats(): Promise<Record<string, number>> {
  const db = await getDB()
  return {
    powerHistory: await db.count('power_history'),
    alerts: await db.count('alerts'),
    connectionLogs: await db.count('connection_logs'),
    commands: await db.count('commands'),
  }
}

// ================================================================
// 用户资料
// ================================================================

/* One device can hold several accounts, so the cache is keyed by the account it
   belongs to. It used to sit under a single unscoped key, which meant signing in
   as somebody else read back the previous account's name, email and avatar. */
const LEGACY_USER_PROFILE_KEY = 'profile'

const profileKey = (account: string) => `account:${account}`

export async function saveUserProfile(account: string, profile: UserProfile): Promise<void> {
  if (!account) return
  const db = await getDB()
  await db.put('user_profile', profile, profileKey(account))
}

export async function getUserProfile(account: string): Promise<UserProfile | null> {
  if (!account) return null
  const db = await getDB()
  const scoped = await db.get('user_profile', profileKey(account))
  if (scoped) return scoped

  // A record written before the key carried an account has no owner, so its name
  // and email cannot be attributed and must not be handed to whoever signs in
  // next. The avatar is the one field the user picked by hand and is worth
  // keeping on what is almost always a single-account device, so adopt that
  // alone and retire the unscoped record.
  const legacy = await db.get('user_profile', LEGACY_USER_PROFILE_KEY)
  if (!legacy) return null
  await db.delete('user_profile', LEGACY_USER_PROFILE_KEY)
  if (!legacy.avatar) return null
  const adopted: UserProfile = { ...legacy, name: '', email: '' }
  await db.put('user_profile', adopted, profileKey(account))
  return adopted
}

export async function clearUserProfile(account: string): Promise<void> {
  if (!account) return
  const db = await getDB()
  await db.delete('user_profile', profileKey(account))
}

// ================================================================
// T10: Smart Schedule 持久化
// ================================================================

const SCHEDULE_KEY = 'peak_shaving_settings'

/** 持久化 Smart Schedule 设置 */
export async function saveScheduleSettings(settings: PeakShavingSettings): Promise<void> {
  const db = await getDB()
  await db.put('smart_schedule', settings, SCHEDULE_KEY)
}

/** 读取持久化的 Smart Schedule 设置 */
export async function loadScheduleSettings(): Promise<PeakShavingSettings | null> {
  const db = await getDB()
  const result = await db.get('smart_schedule', SCHEDULE_KEY)
  return result ?? null
}

/** 清除 Smart Schedule 设置 */
export async function clearScheduleSettings(): Promise<void> {
  const db = await getDB()
  await db.delete('smart_schedule', SCHEDULE_KEY)
}

// ================================================================
// T11: 告警日志持久化增强（批量导入 + 设备ID支持）
// ================================================================

/** 批量导入来自 API 的告警列表 */
export async function importAlertsFromAPI(alerts: Omit<AlertRecord, 'id'>[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('alerts', 'readwrite')
  for (const alert of alerts) {
    await tx.store.add(alert as AlertRecord)
  }
  await tx.done

  // 裁剪超出上限的旧数据
  const count = await db.count('alerts')
  if (count > MAX_ALERTS) {
    const excess = count - MAX_ALERTS
    const trimTx = db.transaction('alerts', 'readwrite')
    let cursor = await trimTx.store.openCursor()
    let deleted = 0
    while (cursor && deleted < excess) {
      await cursor.delete()
      cursor = await cursor.continue()
      deleted++
    }
    await trimTx.done
  }
}

/** 获取指定设备的告警列表 */
export async function getAlertsByDevice(deviceId: string, limit = 50): Promise<AlertRecord[]> {
  const db = await getDB()
  const all = await db.getAll('alerts')
  return all
    .filter(a => a.deviceId === deviceId)
    .reverse()
    .slice(0, limit)
}


// ================================================================
// v4: Rated Params 额定参数缓存
// ================================================================

export async function saveRatedParams(params: RatedParams): Promise<void> {
  const db = await getDB()
  await db.put('rated_params', params, params.deviceId)
}

export async function loadRatedParams(deviceId: string): Promise<RatedParams | undefined> {
  const db = await getDB()
  return db.get('rated_params', deviceId)
}
