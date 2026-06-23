/**
 * T9: 历史功率数据存储 hook
 * - 5 分钟采样（周期采样，而非 10s 实时录入，降低写压力）
 * - 30 天保留（DB_VERSION 升级后自动清理旧数据）
 */
import { useEffect, useRef } from 'react'
import { savePowerHistory } from '../db/powerflowDB'
import { usePowerStationStore } from '../stores/powerStationStore'

/** 5 分钟采样 interval（ms） */
const SAMPLE_INTERVAL_MS = 5 * 60 * 1000

/** 30 天最大条数：30d * 24h * 60min / 5min = 8640 */
export const MAX_HISTORY_30D = 8640

export function usePowerHistorySampler() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { powerStation } = usePowerStationStore()
  const stateRef = useRef(powerStation)
  stateRef.current = powerStation

  useEffect(() => {
    // 立即采样一次
    const sample = () => {
      const s = stateRef.current
      savePowerHistory({
        timestamp: Date.now(),
        remainingBatteryCapacity: s.batteryLevel,
        batteryLevel: s.batteryLevel,
        inputPower: s.inputPower,
        outputPower: s.outputPower,
        solarPower: 0,
        temperature: s.temperature,
        mode: s.mode,
        deviceId: 'local',
      }).catch(err => console.error('[usePowerHistorySampler] addSample failed:', err))
    }

    sample()
    timerRef.current = setInterval(sample, SAMPLE_INTERVAL_MS)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])
}
