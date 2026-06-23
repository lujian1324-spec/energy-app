/**
 * T23: 离线重连数据同步 hook
 *
 * 功能：
 * 1. 监听网络在线/离线事件
 * 2. 网络离线时，将待执行的控制指令加入本地队列（IndexedDB pending_commands）
 * 3. 网络恢复后，自动按序重放队列中的指令
 * 4. 同步上报离线期间错过的历史数据（触发 fetchRecentHistory）
 *
 * 离线队列格式：每条记录存于 localStorage key `offline_cmd_queue`，
 * 使用 JSON 数组，避免对 IndexedDB 版本迁移产生影响。
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { writeDeviceConfig } from '../api/deviceApi'
import { fetchRecentHistory } from '../api/deviceApi'
import { useConnectionStore } from '../stores/connectionStore'

// ----------------------------------------------------------------
// 离线指令队列类型
// ----------------------------------------------------------------
export interface PendingCommand {
  id: string           // 唯一 ID（timestamp + random）
  deviceId: string
  key: string          // 控制 key，如 acOut1Enable
  value: string | number | boolean
  queuedAt: number     // 入队时间戳
  retryCount: number
}

const QUEUE_KEY = 'powerflow_offline_cmd_queue'
const MAX_RETRY = 3

// ----------------------------------------------------------------
// 队列持久化工具
// ----------------------------------------------------------------
function loadQueue(): PendingCommand[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as PendingCommand[]) : []
  } catch {
    return []
  }
}

function saveQueue(queue: PendingCommand[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {/* storage full, ignore */}
}

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ----------------------------------------------------------------
// Hook
// ----------------------------------------------------------------
export interface UseOfflineSyncOptions {
  /** 当前激活设备 ID */
  deviceId?: string
  /** 网络恢复后是否自动拉取最新历史数据 */
  fetchHistoryOnReconnect?: boolean
}

export interface UseOfflineSyncReturn {
  isOnline: boolean
  pendingCount: number
  /** 入队一条离线指令（网络在线时会立即执行，离线时加入队列） */
  enqueueCommand: (key: string, value: string | number | boolean) => Promise<boolean>
  /** 手动触发队列回放（通常自动执行，无需手动调用） */
  flushQueue: () => Promise<void>
  /** 清空离线队列 */
  clearQueue: () => void
}

export function useOfflineSync(opts: UseOfflineSyncOptions = {}): UseOfflineSyncReturn {
  const { deviceId, fetchHistoryOnReconnect = true } = opts
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length)
  const flushing = useRef(false)
  const wasOfflineRef = useRef(!navigator.onLine)

  // ---- 同步在线状态到 connectionStore ----
  const { setActiveDataSource } = useConnectionStore()

  // ---- 更新 pending count ----
  const refreshCount = useCallback(() => {
    setPendingCount(loadQueue().length)
  }, [])

  // ---- 执行队列回放 ----
  const flushQueue = useCallback(async () => {
    if (flushing.current || !deviceId) return
    flushing.current = true

    const queue = loadQueue()
    if (queue.length === 0) {
      flushing.current = false
      return
    }

    console.log(`[OfflineSync] 回放 ${queue.length} 条离线指令...`)
    const remaining: PendingCommand[] = []

    for (const cmd of queue) {
      if (cmd.retryCount >= MAX_RETRY) {
        console.warn(`[OfflineSync] 指令超过最大重试次数，丢弃:`, cmd)
        continue
      }
      try {
        await writeDeviceConfig(cmd.deviceId, cmd.key, cmd.value)
        console.log(`[OfflineSync] ✓ 指令回放成功: ${cmd.key}=${cmd.value}`)
      } catch (err) {
        console.warn(`[OfflineSync] 指令回放失败 (重试 ${cmd.retryCount + 1}/${MAX_RETRY}):`, cmd.key, err)
        remaining.push({ ...cmd, retryCount: cmd.retryCount + 1 })
      }
    }

    saveQueue(remaining)
    refreshCount()
    flushing.current = false
  }, [deviceId, refreshCount])

  // ---- 入队或立即执行 ----
  const enqueueCommand = useCallback(async (
    key: string,
    value: string | number | boolean
  ): Promise<boolean> => {
    if (!deviceId) return false

    if (navigator.onLine) {
      // 在线 → 直接执行
      try {
        await writeDeviceConfig(deviceId, key, value)
        return true
      } catch {
        // 执行失败 → 降级入队
      }
    }

    // 离线 → 入队
    const queue = loadQueue()
    queue.push({
      id: genId(),
      deviceId,
      key,
      value,
      queuedAt: Date.now(),
      retryCount: 0,
    })
    saveQueue(queue)
    refreshCount()
    console.log(`[OfflineSync] 指令已入队（离线）: ${key}=${value}，当前队列: ${queue.length}`)
    return false
  }, [deviceId, refreshCount])

  // ---- 清空队列 ----
  const clearQueue = useCallback(() => {
    saveQueue([])
    refreshCount()
  }, [refreshCount])

  // ---- 网络事件监听 ----
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)
      console.log('[OfflineSync] 网络已恢复')

      if (wasOfflineRef.current) {
        wasOfflineRef.current = false

        // 1. 回放离线指令队列
        await flushQueue()

        // 2. 拉取离线期间错过的历史数据
        if (fetchHistoryOnReconnect && deviceId) {
          try {
            await fetchRecentHistory(Number(deviceId), ['remainingBatteryCapacity', 'batteryPower', 'acPower', 'solarPower'])
            console.log('[OfflineSync] 历史数据补全完成')
          } catch (err) {
            console.warn('[OfflineSync] 历史数据补全失败:', err)
          }
        }
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      wasOfflineRef.current = true
      console.log('[OfflineSync] 网络已断开，指令将进入离线队列')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flushQueue, fetchHistoryOnReconnect, deviceId])

  // ---- 页面加载时若在线则尝试回放（处理上次离线遗留队列） ----
  useEffect(() => {
    if (navigator.onLine && loadQueue().length > 0) {
      void flushQueue()
    }
  }, [flushQueue])

  return { isOnline, pendingCount, enqueueCommand, flushQueue, clearQueue }
}
