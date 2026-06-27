/**
 * 全局低电量监控 hook
 *
 * 在 App 根部挂载一次，使低电量系统通知不再依赖某个页面是否打开：
 * 只要 App 进程存活（前台、后台标签页、最小化的 PWA），就会每 60s 轮询
 * 所有设备的 SOC，跨过阈值时发送系统通知。
 *
 * 限制：浏览器/PWA 无法在 App 进程被完全杀死后主动唤醒执行 JS。要做到
 * “App 彻底关闭也能收到”，需要服务端 Web Push（VAPID + 后端推送），当前
 * 后端未提供该能力。此 hook 覆盖前台 + 后台存活两种最常见场景。
 *
 * 去重：每台设备在跨入低电量后只通知一次（内存边沿检测），并用 localStorage
 * 节流——同一设备 30 分钟内不重复通知（避免刷新/重进反复弹）。
 */
import { useEffect, useRef } from 'react'
import { useDeviceStore } from '../stores/deviceStore'
import { usePowerStationStore } from '../stores/powerStationStore'
import { fetchDeviceState, mapFieldsToRealtime } from '../api/deviceApi'
import { isApiSuccess } from '../utils/apiClient'
import { showLowBatteryNotification, getNotificationPermission } from '../utils/pushNotification'

const POLL_INTERVAL_MS = 60_000
const RENOTIFY_THROTTLE_MS = 30 * 60_000 // 同一设备 30 分钟内不重复通知
const THROTTLE_KEY = 'low_battery_last_notified' // { [deviceId]: timestamp }

function loadThrottle(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(THROTTLE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function saveThrottle(map: Record<string, number>): void {
  try {
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function useLowBatteryMonitor(): void {
  const devices = useDeviceStore(s => s.devices)
  const isDemoMode = useDeviceStore(s => s.isDemoMode)
  const settings = usePowerStationStore(s => s.settings)

  // 每台设备上一次是否处于低电量（边沿检测，仅在“跨入”时通知）
  const prevLowRef = useRef<Record<string, boolean>>({})

  // 用 ref 持有最新 settings/devices，避免轮询闭包读到旧值
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const devicesRef = useRef(devices)
  devicesRef.current = devices

  useEffect(() => {
    if (isDemoMode) return

    let cancelled = false

    const check = async () => {
      const s = settingsRef.current
      if (!(s.pushLowBattery ?? false)) return
      if (getNotificationPermission() !== 'granted') return

      const threshold = s.lowBatteryThreshold ?? 30
      const list = devicesRef.current
      if (!list.length) return

      const throttle = loadThrottle()
      const now = Date.now()
      let throttleDirty = false

      for (const d of list) {
        const id = String(d.id)
        try {
          const res = await fetchDeviceState(id)
          if (cancelled) return
          if (!isApiSuccess(res.code) || !res.data?.fields) continue

          const rt = mapFieldsToRealtime(res.data.fields)
          const soc = rt.remainingBatteryCapacity
          if (typeof soc !== 'number' || soc <= 0) {
            prevLowRef.current[id] = false
            continue
          }

          const isLow = soc < threshold
          const wasLow = prevLowRef.current[id] ?? false
          prevLowRef.current[id] = isLow

          if (isLow && !wasLow) {
            const last = throttle[id] ?? 0
            if (now - last >= RENOTIFY_THROTTLE_MS) {
              await showLowBatteryNotification(Math.round(soc), threshold)
              throttle[id] = now
              throttleDirty = true
            }
          }
        } catch {
          /* 单台设备失败不影响其余 */
        }
      }

      if (throttleDirty) saveThrottle(throttle)
    }

    // 立即检查一次 + 周期轮询
    check()
    const timer = setInterval(check, POLL_INTERVAL_MS)
    // 回到前台时补一次检查（移动端后台常被节流）
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isDemoMode])
}
