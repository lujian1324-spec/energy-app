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

const DB_NAME = 'powerflow-db'
const DB_VERSION = 2

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
  return await db.get('user_profile', USER_PROFILE_KEY)
}

export async function clearUserProfile(): Promise<void> {
  const db = await getDB()
  await db.delete('user_profile', USER_PROFILE_KEY)
}
