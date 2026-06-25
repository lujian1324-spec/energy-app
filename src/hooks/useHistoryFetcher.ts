/**
 * 分页拉取设备历史数据 hook
 * - 每页 10 条，逐页请求直到无更多数据
 * - 每页到达后立即写入 IndexedDB（去重）
 * - 首次挂载时先检查本地缓存，有则直接返回
 */
import { useState, useEffect, useRef } from 'react'
import { fetchHistoryData } from '../api/deviceApi'
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

const PAGE_SIZE = 10
const HISTORY_KEYS = ['generationPower', 'outputPower', 'remainingBatteryCapacity'] as const

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

        // 2. 无缓存 → 分页从 API 拉取
        const existingTs = new Set<number>()
        const allPoints: HistoryPoint[] = []
        let page = 1

        while (!cancelRef.current) {
          const res = await fetchHistoryData({
            deviceId: deviceId!,
            keys: [...HISTORY_KEYS],
            fromTime,
            toTime,
            page,
            count: PAGE_SIZE,
            orderByTimeAsc: true,
          })

          if (cancelRef.current) break

          if (!res.success || !res.data) {
            setError(res.message ?? 'API error')
            break
          }

          const gen  = res.data['generationPower']           ?? []
          const out  = res.data['outputPower']                ?? []
          const soc  = res.data['remainingBatteryCapacity']  ?? []

          const len = Math.max(gen.length, out.length, soc.length)
          if (len === 0) break // 无更多数据

          // 构建本页数据点
          const pageRecords: Omit<PowerHistoryRecord, 'id'>[] = []
          const pagePoints: HistoryPoint[] = []

          for (let i = 0; i < len; i++) {
            const timeStr = gen[i]?.time ?? out[i]?.time ?? soc[i]?.time ?? ''
            const ts = timeStr ? new Date(timeStr).getTime() : fromTime + (page - 1) * PAGE_SIZE * 5 * 60000 + i * 5 * 60000
            pageRecords.push({
              timestamp: ts,
              inputPower: Number(gen[i]?.value ?? 0),
              outputPower: Number(out[i]?.value ?? 0),
              batteryLevel: Number(soc[i]?.value ?? 0),
              solarPower: Number(gen[i]?.value ?? 0),
              remainingBatteryCapacity: Number(soc[i]?.value ?? 0),
              temperature: 0,
              mode: 'normal',
              deviceId: deviceId!,
            })
            pagePoints.push({
              time: timeStr,
              timestamp: ts,
              solar: Number(gen[i]?.value ?? 0),
              output: Number(out[i]?.value ?? 0),
              soc: Number(soc[i]?.value ?? 0),
            })
          }

          // 写入 IndexedDB（去重）
          const saved = await saveHistoryBatch(pageRecords, existingTs)
          allPoints.push(...pagePoints)

          setPoints([...allPoints])
          setCurrentPage(page)
          setSavedCount(prev => prev + saved)

          if (len < PAGE_SIZE) break // 最后一页
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
    }))
}
