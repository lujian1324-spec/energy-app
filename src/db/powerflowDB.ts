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
 * - user_profile 用户资料 (key: 'profile')
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

const DB_NAME = 'powerflow-db'
const DB_VERSION = 4   // v4: add rated_params store

export interface RatedParams {
  deviceId: string
  acInvOutputPower: number  // 交流逆变输出功率 (W), register 0x000A
  fetchedAt: number         // unix ms
}

/** 最大保留条数（避免无限增长） */
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
  }>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
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
 * 按设备 ID + 时间段读取本地缓存的历史数据
 */
export async function getHistoryByDeviceAndRange(
  deviceId: string,
  fromTime: number,
  toTime: number
): Promise<PowerHistoryRecord[]> {
  const db = await getDB()
  const index = db.transaction('power_history').store.index('timestamp')
  const range = IDBKeyRange.bound(fromTime, toTime)

  const results: PowerHistoryRecord[] = []
  let cursor = await index.openCursor(range, 'next')
  while (cursor) {
    if (!cursor.value.deviceId || cursor.value.deviceId === deviceId) {
      results.push(cursor.value)
    }
    cursor = await cursor.continue()
  }
  return results
}

/**
 * 批量写入历史记录，跳过已存在的时间戳（按 deviceId+timestamp 去重）
 */
export async function saveHistoryBatch(
  records: Omit<PowerHistoryRecord, 'id'>[],
  existingTimestamps: Set<number>
): Promise<number> {
  if (records.length === 0) return 0
  const db = await getDB()
  const tx = db.transaction('power_history', 'readwrite')
  let saved = 0
  for (const r of records) {
    if (!existingTimestamps.has(r.timestamp)) {
      await tx.store.add(r as PowerHistoryRecord)
      existingTimestamps.add(r.timestamp)
      saved++
    }
  }
  await tx.done

  // 裁剪超出上限
  const count = await db.count('power_history')
  if (count > MAX_POWER_HISTORY) {
    const trimTx = db.transaction('power_history', 'readwrite')
    const cursor = await trimTx.store.openCursor()
    if (cursor) await cursor.delete()
    await trimTx.done
  }
  return saved
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

const USER_PROFILE_KEY = 'profile'

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const db = await getDB()
  await db.put('user_profile', profile, USER_PROFILE_KEY)
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const db = await getDB()
  const profile = await db.get('user_profile', USER_PROFILE_KEY)
  return profile ?? null
}

export async function clearUserProfile(): Promise<void> {
  const db = await getDB()
  await db.delete('user_profile', USER_PROFILE_KEY)
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
