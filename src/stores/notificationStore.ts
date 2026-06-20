/**
 * 通知状态管理
 *
 * 跟踪通知的已读/删除状态，供：
 *  - DevicePage 铃铛红点（未读指示，查看后消失）
 *  - NotificationsPage 列表、滑动删除、空状态
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { demoNotifications, type DemoNotification } from '../data/demoData'

export type NotificationItem = DemoNotification

interface NotificationState {
  /** 已删除的通知 ID */
  deletedIds: number[]
  /** 已读时间戳（毫秒）；用于判断红点是否消失 */
  lastReadAt: number
  /** 列表（排除已删除），可按设备序列号过滤 */
  items: (deviceSerial?: string) => NotificationItem[]
  /** 未读数量，可按设备过滤 */
  unreadCount: (deviceSerial?: string) => number
  /** 标记全部已读（进入通知页时调用） */
  markAllRead: () => void
  /** 删除单条 */
  deleteNotification: (id: number) => void
  /** 清空全部 */
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      deletedIds: [],
      lastReadAt: 0,

      items: (deviceSerial?: string) => {
        const all = demoNotifications.filter(n => !get().deletedIds.includes(n.id))
        return deviceSerial ? all.filter(n => n.deviceSerial === deviceSerial) : all
      },

      unreadCount: (deviceSerial?: string) => {
        if (get().lastReadAt > 0) return 0
        return get().items(deviceSerial).length
      },

      markAllRead: () => set({ lastReadAt: Date.now() }),

      deleteNotification: (id) =>
        set(state => ({ deletedIds: [...state.deletedIds, id] })),

      clearAll: () =>
        set({ deletedIds: demoNotifications.map(n => n.id) }),
    }),
    { name: 'sierro-notifications' },
  ),
)
