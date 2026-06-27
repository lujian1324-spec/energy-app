/**
 * 连接状态 Store
 * 管理 BLE 连接状态，对接协议层与 UI
 */

import { create } from 'zustand'
import type { ConnectionInfo } from '../types/protocol'

export type DataSource = 'simulator' | 'bluetooth'

interface ConnectionState {
  // 连接信息
  bleConnection: ConnectionInfo

  // 当前激活的数据源
  activeDataSource: DataSource

  // BLE 支持检测
  bleSupported: boolean

  // 动作
  setBleConnection: (info: ConnectionInfo) => void
  setActiveDataSource: (source: DataSource) => void

  // 未读告警数量（用于底部 badge）
  unreadAlertCount: number
  setUnreadAlertCount: (n: number) => void
  incrementUnreadAlert: () => void
}

const defaultBle: ConnectionInfo = {
  protocol: 'bluetooth',
  status: 'disconnected',
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  bleConnection: defaultBle,
  activeDataSource: 'simulator',

  bleSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,

  setBleConnection: (info) =>
    set((state) => {
      const wasConnected = state.bleConnection.status === 'connected'
      const nowConnected = info.status === 'connected'
      return {
        bleConnection: info,
        // 自动切换数据源
        activeDataSource:
          nowConnected ? 'bluetooth' :
          wasConnected && state.activeDataSource === 'bluetooth' ? 'simulator' :
          state.activeDataSource,
      }
    }),

  setActiveDataSource: (source) => set({ activeDataSource: source }),

  unreadAlertCount: 0,
  setUnreadAlertCount:  (n) => set({ unreadAlertCount: n }),
  incrementUnreadAlert: () => set((state) => ({ unreadAlertCount: state.unreadAlertCount + 1 })),
}))
