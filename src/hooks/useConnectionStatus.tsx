/**
 * T26: 连接状态监听 + UI 状态同步 hook
 *
 * 统一聚合所有连接维度的状态，方便 UI 组件获取一致的连接摘要：
 * - BLE 连接状态
 * - Serial 连接状态
 * - WebSocket 实时推送状态
 * - 网络在线状态
 * - 当前激活数据源（simulator / bluetooth / serial / websocket）
 *
 * 提供:
 * - connectionSummary: 合并后的最终状态（用于顶部状态指示器）
 * - statusLabel: 人类可读状态文字
 * - statusColor: 对应颜色（用于 UI badge）
 */

import { useMemo, useEffect, useState } from 'react'
import { useConnectionStore } from '../stores/connectionStore'
import type { WsStatus } from './useDeviceWebSocket'

// ----------------------------------------------------------------
// 连接摘要类型
// ----------------------------------------------------------------
export type ConnectionHealth = 'good' | 'degraded' | 'offline' | 'unknown'

export interface ConnectionSummary {
  /** 总体健康等级 */
  health: ConnectionHealth
  /** 人类可读状态文字（英文） */
  statusLabel: string
  /** 对应品牌色 HEX */
  statusColor: string
  /** 当前激活数据源 */
  activeSource: string
  /** BLE 已连接 */
  bleConnected: boolean
  /** Serial 已连接 */
  serialConnected: boolean
  /** WebSocket 已连接 */
  wsConnected: boolean
  /** 网络在线 */
  networkOnline: boolean
  /** 未读告警数 */
  unreadAlerts: number
}

// ----------------------------------------------------------------
// hook
// ----------------------------------------------------------------
export interface UseConnectionStatusOptions {
  /** WebSocket 当前状态（从 useDeviceWebSocket 传入） */
  wsStatus?: WsStatus
}

export function useConnectionStatus(opts: UseConnectionStatusOptions = {}) {
  const { wsStatus = 'disconnected' } = opts
  const {
    bleConnection,
    serialConnection,
    activeDataSource,
    unreadAlertCount,
  } = useConnectionStore()

  const [networkOnline, setNetworkOnline] = useState(navigator.onLine)

  // 监听网络事件
  useEffect(() => {
    const onOnline = () => setNetworkOnline(true)
    const onOffline = () => setNetworkOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const summary = useMemo((): ConnectionSummary => {
    const bleConnected = bleConnection.status === 'connected'
    const serialConnected = serialConnection.status === 'connected'
    const wsConnected = wsStatus === 'connected'

    // 确定健康等级
    let health: ConnectionHealth
    let statusLabel: string
    let statusColor: string

    if (!networkOnline) {
      health = 'offline'
      statusLabel = 'Offline'
      statusColor = '#FF3B30'  // Danger
    } else if (bleConnected || serialConnected || wsConnected) {
      health = 'good'
      if (bleConnected) statusLabel = `BLE · ${bleConnection.deviceName ?? 'Connected'}`
      else if (serialConnected) statusLabel = 'Serial · Connected'
      else statusLabel = 'Cloud · Live'
      statusColor = '#01D6BE'  // Primary
    } else if (wsStatus === 'connecting' || bleConnection.status === 'connecting' || bleConnection.status === 'scanning') {
      health = 'degraded'
      statusLabel = 'Connecting...'
      statusColor = '#FF9500'  // Warning
    } else if (wsStatus === 'error' || bleConnection.status === 'error') {
      health = 'degraded'
      statusLabel = 'Connection Error'
      statusColor = '#FF9500'
    } else if (activeDataSource === 'simulator') {
      health = 'unknown'
      statusLabel = 'Demo Mode'
      statusColor = '#BFBFBF'  // Text Secondary
    } else {
      health = 'unknown'
      statusLabel = 'Disconnected'
      statusColor = '#8C8C8C'  // Text Muted
    }

    return {
      health,
      statusLabel,
      statusColor,
      activeSource: activeDataSource,
      bleConnected,
      serialConnected,
      wsConnected,
      networkOnline,
      unreadAlerts: unreadAlertCount,
    }
  }, [
    bleConnection,
    serialConnection,
    wsStatus,
    activeDataSource,
    networkOnline,
    unreadAlertCount,
  ])

  return summary
}

// ----------------------------------------------------------------
// 连接状态指示器组件（纯展示，可直接嵌入 TopBar）
// 使用时: import { ConnectionIndicator } from '../hooks/useConnectionStatus'
// ----------------------------------------------------------------
import React from 'react'
import { Wifi, WifiOff, Bluetooth, Monitor } from 'lucide-react'

interface ConnectionIndicatorProps {
  summary: ConnectionSummary
  className?: string
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  summary,
  className = '',
}) => {
  const Icon = summary.bleConnected ? Bluetooth
    : !summary.networkOnline ? WifiOff
    : summary.wsConnected ? Wifi
    : Monitor

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${className}`}
      style={{
        backgroundColor: `${summary.statusColor}20`,
        color: summary.statusColor,
      }}
    >
      {/* 状态点动画 */}
      {summary.health === 'good' && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: summary.statusColor }}
        />
      )}
      {summary.health !== 'good' && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: summary.statusColor }}
        />
      )}

      <Icon size={11} />
      <span>{summary.statusLabel}</span>

      {/* 未读告警 badge */}
      {summary.unreadAlerts > 0 && (
        <span
          className="ml-0.5 px-1 rounded-full text-white text-[10px] font-bold leading-4"
          style={{ backgroundColor: '#FF3B30', minWidth: '16px', textAlign: 'center' }}
        >
          {summary.unreadAlerts > 99 ? '99+' : summary.unreadAlerts}
        </span>
      )}
    </div>
  )
}
