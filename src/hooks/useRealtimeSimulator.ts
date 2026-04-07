import { useEffect } from 'react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import { savePowerHistory } from '../db/powerflowDB'

/**
 * 实时数据模拟 Hook
 * - 仅在 activeDataSource === 'simulator' 时运行
 * - 每 3 秒轻微波动太阳能输入功率（±20W 随机漂移）
 * - 每 8 秒根据净功率缓慢更新 batteryLevel / remainingWh
 * - 每 10 秒将快照写入 IndexedDB 历史
 * - 用 getState() 读取最新值，避免 stale closure
 */
export function useRealtimeSimulator() {
  const updatePowerData = usePowerStationStore((s) => s.updatePowerData)
  const updateBatteryLevel = usePowerStationStore((s) => s.updateBatteryLevel)
  const activeDataSource = useConnectionStore((s) => s.activeDataSource)

  useEffect(() => {
 // 连接硬件时暂停模拟，避免覆盖真实数据
 if (activeDataSource !== 'simulator') return

 // 每 3 秒波动功率
 const powerInterval = setInterval(() => {
 const { powerStation } = usePowerStationStore.getState()

 const solarDelta = (Math.random() - 0.5) * 40 // ±20W
 const loadDelta  = (Math.random() - 0.5) * 20 // ±10W

 const newInput  = Math.max(50,  Math.min(480, powerStation.inputPower  + solarDelta))
 const newOutput = Math.max(20,  Math.min(300, powerStation.outputPower + loadDelta))

 updatePowerData(Math.round(newInput), Math.round(newOutput))
 }, 3000)

 // 每 8 秒更新电量
 const batteryInterval = setInterval(() => {
 const { powerStation } = usePowerStationStore.getState()

 const net = powerStation.inputPower - powerStation.outputPower
 const delta = (net / 10000) * 0.5
 const newLevel = Math.max(5, Math.min(100, powerStation.batteryLevel + delta))

 updateBatteryLevel(Math.round(newLevel))
 }, 8000)

 // 每 10 秒将快照写入 IndexedDB
 const historyInterval = setInterval(() => {
 const { powerStation } = usePowerStationStore.getState()
 void savePowerHistory({
 timestamp: Date.now(),
 batteryLevel: powerStation.batteryLevel,
 inputPower: powerStation.inputPower,
 outputPower:  powerStation.outputPower,
 temperature:  powerStation.temperature,
 mode: powerStation.mode,
 })
 }, 10000)

 return () => {
 clearInterval(powerInterval)
 clearInterval(batteryInterval)
 clearInterval(historyInterval)
 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataSource])
}
