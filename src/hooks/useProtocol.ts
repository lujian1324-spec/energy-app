/**
 * useProtocol Hook
 * 统一管理 BLE 和 Serial 连接的生命周期
 * - 连接/断开时更新 connectionStore
 * - 收到硬件数据时更新 powerStationStore
 * - 自动触发告警检测
 */

import { useCallback, useRef } from 'react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import {
  getBleManager,
  destroyBleManager,
  type BleCallbacks,
} from '../protocols/bleManager'
import {
  getSerialManager,
  destroySerialManager,
  type SerialCallbacks,
} from '../protocols/serialModbus'
import {
  addAlert,
  logConnection,
} from '../db/powerflowDB'
import type { ConnectionInfo } from '../types/protocol'

// 端口 bit → portId 映射
const PORT_BIT_MAP: Record<number, string> = {
  0: 'ac-out-1',
  1: 'ac-out-2',
  2: 'usb-out-1',
  3: 'usb-out-2',
}

const MODE_MAP: Record<number, string> = {
  0: 'solar', 1: 'backup', 2: 'car', 3: 'outdoor',
}

export function useProtocol() {
  const { updateBatteryLevel, updatePowerData, setMode } = usePowerStationStore()
  const {
    setBleConnection,
    setSerialConnection,
    incrementUnreadAlert,
  } = useConnectionStore()

  const bleRef    = useRef<ReturnType<typeof getBleManager> | null>(null)
  const serialRef = useRef<ReturnType<typeof getSerialManager> | null>(null)

  // ---- BLE 回调 ----
  const bleCallbacks: BleCallbacks = {
    onStatusChange: useCallback((info: ConnectionInfo) => {
      setBleConnection(info)
      if (info.status === 'error' && info.errorMessage) {
        console.warn('[BLE]', info.errorMessage)
      }
    }, [setBleConnection]),

    onPowerData: useCallback((packet) => {
      updatePowerData(packet.inputPower, packet.outputPower)
      // 过温告警
      if (packet.temperature >= 55) {
        void addAlert({
          timestamp: Date.now(),
          type:      'over_temp',
          severity:  'critical',
          message:   `设备温度过高：${packet.temperature}°C`,
          resolved:  false,
        })
        incrementUnreadAlert()
      }
    }, [updatePowerData, incrementUnreadAlert]),

    onBatteryLevel: useCallback((level) => {
      updateBatteryLevel(level)
      if (level <= 10) {
        void addAlert({
          timestamp: Date.now(),
          type:      'battery_low',
          severity:  'warning',
          message:   `电量过低：${level}%，请及时充电`,
          resolved:  false,
        })
        incrementUnreadAlert()
      }
    }, [updateBatteryLevel, incrementUnreadAlert]),

    onPortStatus: useCallback((bitmap) => {
      // 根据 bitmap 同步端口状态（触发 store 更新）
      const state = usePowerStationStore.getState()
      const updatedPorts = state.powerStation.ports.map(port => {
        const bitEntry = Object.entries(PORT_BIT_MAP).find(([, id]) => id === port.id)
        if (!bitEntry) return port
        const bit    = Number(bitEntry[0])
        const isActive = !!(bitmap & (1 << bit))
        return { ...port, status: isActive ? 'active' as const : 'inactive' as const }
      })
      usePowerStationStore.setState(s => ({
        powerStation: { ...s.powerStation, ports: updatedPorts }
      }))
    }, []),

    onModeChange: useCallback((mode) => {
      setMode(mode as Parameters<typeof setMode>[0])
    }, [setMode]),
  }

  // ---- Serial 回调 ----
  const serialCallbacks: SerialCallbacks = {
    onStatusChange: useCallback((info: ConnectionInfo) => {
      setSerialConnection(info)
    }, [setSerialConnection]),

    onStationData: useCallback((data) => {
      updateBatteryLevel(data.batteryLevel)
      updatePowerData(data.inputPower, data.outputPower)
      setMode(data.operatingMode as Parameters<typeof setMode>[0])

      // 温度告警
      if (data.temperature >= 55) {
        void addAlert({
          timestamp: Date.now(),
          type:      'over_temp',
          severity:  'critical',
          message:   `串口读取：设备温度过高 ${data.temperature}°C`,
          resolved:  false,
        })
        incrementUnreadAlert()
      }

      // 同步端口状态
      const state  = usePowerStationStore.getState()
      const bitmap = data.portStatusBitmap
      const updatedPorts = state.powerStation.ports.map(port => {
        const bitEntry = Object.entries(PORT_BIT_MAP).find(([, id]) => id === port.id)
        if (!bitEntry) return port
        const bit      = Number(bitEntry[0])
        const isActive = !!(bitmap & (1 << bit))
        return { ...port, status: isActive ? 'active' as const : 'inactive' as const }
      })
      usePowerStationStore.setState(s => ({
        powerStation: { ...s.powerStation, ports: updatedPorts }
      }))
    }, [updateBatteryLevel, updatePowerData, setMode, incrementUnreadAlert]),

    onError: useCallback((message) => {
      console.error('[Serial]', message)
    }, []),
  }

  // ---- 公开操作 ----

  const connectBle = useCallback(async () => {
    bleRef.current = getBleManager(bleCallbacks)
    await bleRef.current.connect()
  }, [bleCallbacks])

  const disconnectBle = useCallback(async () => {
    await bleRef.current?.disconnect()
    destroyBleManager()
    bleRef.current = null
  }, [])

  const connectSerial = useCallback(async (baudRate: 9600 | 19200 = 9600) => {
    serialRef.current = getSerialManager(serialCallbacks)
    await serialRef.current.connect(baudRate)
  }, [serialCallbacks])

  const disconnectSerial = useCallback(async () => {
    await serialRef.current?.disconnect()
    destroySerialManager()
    serialRef.current = null
  }, [])

  // 向当前激活的协议发送命令（BLE 优先）
  const sendSetMode = useCallback(async (mode: string) => {
    const src = useConnectionStore.getState().activeDataSource
    if (src === 'bluetooth') return bleRef.current?.setMode(mode)
    if (src === 'serial')    return serialRef.current?.setMode(mode)
  }, [])

  const sendSetChargeLimit = useCallback(async (limit: number) => {
    const src = useConnectionStore.getState().activeDataSource
    if (src === 'bluetooth') return bleRef.current?.setChargeLimit(limit)
    if (src === 'serial')    return serialRef.current?.setChargeLimit(limit)
  }, [])

  return {
    connectBle,
    disconnectBle,
    connectSerial,
    disconnectSerial,
    sendSetMode,
    sendSetChargeLimit,
  }
}
