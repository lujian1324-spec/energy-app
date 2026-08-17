/**
 * 已清除（dismissed）告警状态
 *
 * 单一事实来源，供：
 *  - DevicePage 铃铛红点（仅在有「未清除的实时告警」时显示）
 *  - NotificationsPage 告警列表（点击某条即清除，从列表移除）
 *
 * 实时 firingAlarms 每次轮询都会重新下发，所以「清除」是本地记忆：
 * 只要该告警仍在 firing 就保持隐藏；当它不再 firing 时，syncActive() 会把
 * 这条记忆丢弃，之后若同类告警再次触发会重新出现（而不是被永久静音）。
 * key 形如 `${deviceId}::${title}`（title 由 dedupeAndFilterAlarms 解析，
 * 与 NotificationsPage 的行 key 一致，且按设备隔离）。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export function alarmKey(deviceId: string | number | null | undefined, title: string): string {
  return `${deviceId ?? '?'}::${title}`
}

interface AlarmDismissState {
  /** 已清除的告警 key 列表 */
  dismissed: string[]
  /** 清除单条 */
  dismiss: (key: string) => void
  /**
   * 用某设备当前仍在 firing 的 key 集合，修剪该设备已不再 firing 的「已清除」记忆，
   * 让真正复现的告警能重新出现。只影响该设备自己的 key。
   */
  syncActive: (deviceId: string | number | null | undefined, activeKeys: string[]) => void
}

export const useAlarmDismissStore = create<AlarmDismissState>()(
  persist(
    (set) => ({
      dismissed: [],
      dismiss: (key) =>
        set((s) => (s.dismissed.includes(key) ? s : { dismissed: [...s.dismissed, key] })),
      syncActive: (deviceId, activeKeys) =>
        set((s) => {
          const prefix = `${deviceId ?? '?'}::`
          const active = new Set(activeKeys)
          const next = s.dismissed.filter((k) => !k.startsWith(prefix) || active.has(k))
          // Avoid a needless state update (and re-render loop) when nothing changed.
          return next.length === s.dismissed.length ? s : { dismissed: next }
        }),
    }),
    { name: 'sierro-alarm-dismissed' },
  ),
)
