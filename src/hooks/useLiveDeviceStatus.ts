/**
 * useLiveDeviceStatus — 设备实时状态统一入口（R1 实时链路重构）
 *
 * 数据源优先级：
 *  1. fastReport  平台速报模式：startFastReport 让设备提高云端上报频率，
 *                 App 每 5s 拉一次 /remote/device/state/latest（普通云端读，
 *                 便宜且不占透传信道）。离开页面 stopFastReport。
 *  2. passthrough 设备不支持速报（旧固件 / supported 接口失败）时，
 *                 回退到 Modbus 透传 READ_ALL_STATUS 每 5s 轮询（原方案）。
 *
 * 共同规则：
 *  - 页面不可见时跳过 tick（切后台不空转）
 *  - 上一次请求未返回时跳过（不并发）
 *  - 连续 3 次失败清空 live 值，让 UI 如实回退到 30s 云端状态/离线显示
 */
import { useEffect, useRef, useState } from 'react'
import {
  passthroughDevice,
  fetchDeviceState,
  startFastReport,
  stopFastReport,
  checkFastReportSupported,
  mapFieldsToRealtime,
} from '../api/deviceApi'
import { FRAMES, decodePassthroughBase64, decodeLiveStatus, type LiveStatus } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'

export type LiveSource = 'fastReport' | 'passthrough'

export interface LiveDeviceStatus {
  live: LiveStatus | null
  /** 当前生效的数据源；null = 尚未取得任何实时值 */
  source: LiveSource | null
}

/** 速报 clientID：每个安装实例一个，平台按 clientID 管理速报会话 */
function getClientId(): string {
  const KEY = 'sierro_fast_report_client_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = (crypto.randomUUID?.() ?? `web-${Date.now()}-${Math.floor(Math.random() * 1e9)}`)
    localStorage.setItem(KEY, id)
  }
  return id
}

/** supported 接口的 data 形态未文档化，宽松判定：true / 'true' / {supported:true} / {isSupported:true} */
export function parseSupported(data: unknown): boolean {
  if (data === true || data === 'true' || data === 1 || data === '1') return true
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    return o.supported === true || o.isSupported === true || o.support === true
  }
  return false
}

const POLL_MS = 5000
const FAIL_LIMIT = 3

export function useLiveDeviceStatus(deviceId: string | null, enabled = true): LiveDeviceStatus {
  const [live, setLive] = useState<LiveStatus | null>(null)
  const [source, setSource] = useState<LiveSource | null>(null)
  // fastReport 会话是否已启动（用于卸载时 stop）
  const fastActiveRef = useRef(false)

  useEffect(() => {
    if (!deviceId || !enabled) { setLive(null); setSource(null); return }
    let cancelled = false
    let inFlight = false
    let failStreak = 0
    let mode: LiveSource = 'passthrough'

    const onFail = () => {
      failStreak += 1
      if (failStreak >= FAIL_LIMIT && !cancelled) { setLive(null); setSource(null) }
    }
    const onOk = (v: LiveStatus) => {
      failStreak = 0
      if (!cancelled) { setLive(v); setSource(mode) }
    }

    // ── 速报路径：拉云端最新状态并映射为 LiveStatus 形态 ──
    const readCloudOnce = async () => {
      const res = await fetchDeviceState(deviceId)
      if (cancelled) return
      if (!isApiSuccess(res.code) || !res.data?.fields) { onFail(); return }
      const rt = mapFieldsToRealtime(res.data.fields)
      // 关键字段全缺 = 无效样本（设备可能刚离线，字段为空）
      if (rt.remainingBatteryCapacity === undefined && rt.acPower === undefined &&
          rt.solarPower === undefined && rt.outputPower === undefined) { onFail(); return }
      onOk({
        soc: rt.remainingBatteryCapacity ?? 0,
        acPower: rt.acPower ?? 0,
        solarPower: rt.solarPower ?? 0,
        outputPower: rt.outputPower ?? 0,
        batteryPower: rt.batteryPower ?? 0,
        batteryTemp: rt.batteryTemp ?? 0,
      })
    }

    // ── 透传路径（回退）：READ_ALL_STATUS → CRC 校验解码 ──
    const readPassthroughOnce = async () => {
      const res = await passthroughDevice(deviceId, { data: FRAMES.READ_ALL_STATUS })
      if (cancelled) return
      if (!isApiSuccess(res.code)) { onFail(); return }
      const registers = decodePassthroughBase64(
        res.data?.base64Output ?? res.data?.content ?? res.data?.data, 8)
      if (registers) onOk(decodeLiveStatus(registers))
      else onFail()
    }

    const tick = async () => {
      if (document.visibilityState === 'hidden' || inFlight || cancelled) return
      inFlight = true
      try {
        if (mode === 'fastReport') await readCloudOnce()
        else await readPassthroughOnce()
      } catch { onFail() }
      finally { inFlight = false }
    }

    let iv: ReturnType<typeof setInterval> | null = null
    const begin = async () => {
      // 探测速报支持；接口失败/不支持 → 透传回退
      try {
        const sup = await checkFastReportSupported(deviceId)
        if (!cancelled && isApiSuccess(sup.code) && parseSupported(sup.data)) {
          // 关键：在 await startFastReport 之前就置位，这样即使卸载发生在启动往返途中，
          // cleanup 也会调用 stopFastReport，不会把设备遗留在高频上报状态。
          fastActiveRef.current = true
          await startFastReport(deviceId, getClientId())
          if (!cancelled) mode = 'fastReport'
        }
      } catch { /* 探测/启动失败 → 保持透传（stopFastReport 幂等，多停无害）*/ }
      if (cancelled) return
      tick()
      iv = setInterval(tick, POLL_MS)
    }
    begin()

    return () => {
      cancelled = true
      if (iv) clearInterval(iv)
      if (fastActiveRef.current) {
        fastActiveRef.current = false
        stopFastReport(deviceId, getClientId()).catch(() => { /* ignore */ })
      }
      setLive(null)
      setSource(null)
    }
  }, [deviceId, enabled])

  return { live, source }
}
