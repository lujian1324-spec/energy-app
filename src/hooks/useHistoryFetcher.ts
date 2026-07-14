/**
 * 分页拉取设备当天历史数据 hook（doGetDeviceHistory 模式）。
 * - 调用 POST /deviceState/attribute/record/list（参考 Dart doGetDeviceHistory）
 * - 每页 80 条（匹配参考实现 count:80），逐页请求直到无更多数据
 * - 每页到达后立即写入 IndexedDB（去重）
 * - 首次挂载时先检查本地缓存，有则直接返回
 */
import { useState, useEffect, useRef } from 'react'
import { fetchDeviceRecordHistory } from '../api/deviceApi'
import type { DeviceAttributeRecord } from '../api/deviceApi'
import { isApiSuccess } from '../utils/apiClient'
import {
  getHistoryByDeviceAndRange,
  saveHistoryBatch,
} from '../db/powerflowDB'
import type { PowerHistoryRecord } from '../types/protocol'

export interface HistoryPoint {
  time: string       // ISO 时间字符串
  timestamp: number  // Unix ms
  solar: number      // generationPower W
  output: number     // outputPower W
  soc: number        // remainingBatteryCapacity %
  battery: number    // batteryPower W (charge positive, discharge negative)
  ac: number         // exchangeChargingPower W
}

export interface UseHistoryFetcherResult {
  points: HistoryPoint[]
  loading: boolean
  done: boolean
  currentPage: number
  savedCount: number
  fromCache: boolean
  error: string | null
}

const PAGE_SIZE = 80
const HISTORY_KEYS = [
  'generationPower',
  'outputPower',
  'remainingBatteryCapacity',
  'batteryPower',
  'exchangeChargingPower',
] as const

/** 将毫秒时间戳转为 ISO 8601 字符串（带时区偏移） */
function toIsoTz(ms: number): string {
  const d = new Date(ms)
  const tzOffset = -d.getTimezoneOffset()
  const tzStr = (tzOffset >= 0 ? '+' : '') +
    String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0') +
    ':' +
    String(Math.abs(tzOffset) % 60).padStart(2, '0')
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0') +
    tzStr
}

/** 从 DeviceAttributeRecord 中提取数值 */
function extractVal(rec: DeviceAttributeRecord, key: string): number {
  const v = rec[key]
  if (v === undefined || v === null) return 0
  if (typeof v === 'object' && 'value' in v) return Number((v as any).value ?? 0)
  if (typeof v === 'number') return v
  return Number(v) || 0
}

export function useHistoryFetcher(
  deviceId: string | null,
  fromTime: number,
  toTime: number
): UseHistoryFetcherResult {
  const [points, setPoints] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!deviceId) return
    cancelRef.current = false
    setPoints([])
    setDone(false)
    setCurrentPage(0)
    setSavedCount(0)
    setFromCache(false)
    setError(null)

    async function run() {
      setLoading(true)
      try {
        // 1. 先读本地缓存
        const cached = await getHistoryByDeviceAndRange(deviceId!, fromTime, toTime)
        if (cancelRef.current) return

        if (cached.length > 0) {
          const pts = toHistoryPoints(cached)
          setPoints(pts)
          setFromCache(true)
          setDone(true)
          setSavedCount(cached.length)
          return
        }

        // 2. 无缓存 → 分页从 POST /deviceState/attribute/record/list 拉取
        const existingTs = new Set<number>()
        const allPoints: HistoryPoint[] = []
        let page = 1
        const fromTimeIso = toIsoTz(fromTime)
        const toTimeIso = toIsoTz(toTime)

        while (!cancelRef.current) {
          const res = await fetchDeviceRecordHistory({
            deviceId: deviceId!,
            fromTime: fromTimeIso,
            toTime: toTimeIso,
            page,
            count: PAGE_SIZE,
            orderByTimeAsc: true,
          })

          if (cancelRef.current) break

          if (!isApiSuccess(res.code) || !res.data) {
            setError(res.message ?? res.msg ?? 'API error')
            break
          }

          const list = res.data.list ?? []
          if (list.length === 0) break

          const pageRecords: Omit<PowerHistoryRecord, 'id'>[] = []
          const pagePoints: HistoryPoint[] = []

          for (const rec of list) {
            const timeStr = (rec.time as string) ?? ''
            const ts = timeStr ? new Date(timeStr).getTime() : 0
            if (!ts) continue

            const gen = extractVal(rec, 'generationPower')
            const out = extractVal(rec, 'outputPower')
            const soc = extractVal(rec, 'remainingBatteryCapacity')
            const bat = extractVal(rec, 'batteryPower')
            const ac = extractVal(rec, 'exchangeChargingPower')

            pageRecords.push({
              timestamp: ts,
              inputPower: gen,
              outputPower: out,
              batteryLevel: soc,
              solarPower: gen,
              remainingBatteryCapacity: soc,
              temperature: 0,
              mode: 'normal',
              deviceId: deviceId!,
            })
            pagePoints.push({
              time: timeStr,
              timestamp: ts,
              solar: gen,
              output: out,
              soc,
              battery: bat,
              ac,
            })
          }

          const saved = await saveHistoryBatch(pageRecords, existingTs)
          allPoints.push(...pagePoints)

          setPoints([...allPoints])
          setCurrentPage(page)
          setSavedCount(prev => prev + saved)

          if (list.length < PAGE_SIZE) break
          page++
        }

        if (!cancelRef.current) setDone(true)
      } catch (e) {
        if (!cancelRef.current) setError(String(e))
      } finally {
        if (!cancelRef.current) setLoading(false)
      }
    }

    run()
    return () => { cancelRef.current = true }
  }, [deviceId, fromTime, toTime])

  return { points, loading, done, currentPage, savedCount, fromCache, error }
}

// ─── 将 PowerHistoryRecord[] 转为 HistoryPoint[] ──────────────────────────────
function toHistoryPoints(records: PowerHistoryRecord[]): HistoryPoint[] {
  return records
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(r => ({
      time: new Date(r.timestamp).toISOString(),
      timestamp: r.timestamp,
      solar: r.solarPower ?? r.inputPower,
      output: r.outputPower,
      soc: r.remainingBatteryCapacity ?? r.batteryLevel,
      battery: 0,
      ac: 0,
    }))
}
