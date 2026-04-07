/**
 * 连接状态 Store
 * 管理 BLE / Serial 连接状态，对接协议层与 UI
 */

import { create } from 'zustand'
import type { ConnectionInfo } from '../types/protocol'

export type DataSource = 'simulator' | 'bluetooth' | 'serial'

interface ConnectionState {
  // 连接信息
  bleConnection: ConnectionInfo
  serialConnection: ConnectionInfo

  // 当前激活的数据源
  activeDataSource: DataSource

  // BLE & Serial 支持检测
  bleSupported: boolean
  serialSupported: boolean

  // 动作
  setBleConnection: (info: ConnectionInfo) => void
  setSerialConnection: (info: ConnectionInfo) => void
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

const defaultSerial: ConnectionInfo = {
  protocol: 'serial',
  status: 'disconnected',
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  bleConnection: defaultBle,
  serialConnection: defaultSerial,
  activeDataSource: 'simulator',

  bleSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
  serialSupported: typeof navigator !== 'undefined' && 'serial' in navigator,

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

  setSerialConnection: (info) =>
 set((state) => {
 const wasConnected = state.serialConnection.status === 'connected'
 const nowConnected = info.status === 'connected'
 return {
 serialConnection: info,
 activeDataSource:
 nowConnected ? 'serial' :
 wasConnected && state.activeDataSource === 'serial' ? 'simulator' :
 state.activeDataSource,
 }
 }),

  setActiveDataSource: (source) => set({ activeDataSource: source }),

  unreadAlertCount: 0,
  setUnreadAlertCount:  (n) => set({ unreadAlertCount: n }),
  incrementUnreadAlert: () => set((state) => ({ unreadAlertCount: state.unreadAlertCount + 1 })),
}))
