/**
 * Sleep Mode 排程上报到自建 relay
 *
 * 用户保存 Sleep Mode 时,把该设备的睡眠时段上传给常驻 relay（server/）。relay 的
 * poller 会到点(按上传的 IANA 时区)呼叫设备控制 API 写充电功率,因此 App 关闭也生效。
 *
 * 认证沿用推送那套「专用 poller 会话」一次性 bootstrap（authApi.provisionPollerSession
 * 在密码登录时存下 access+refresh 对,存于 POLLER_REFRESH_PENDING_KEY）。首个上报
 * （排程或推送订阅,谁先谁上）把它交给 relay,relay 之后自行轮换,故成功后即消费掉,
 * 不再重传已轮换的旧副本。
 *
 * 走原生 fetch 直连 relay 基址（非官方 api）；relay 端已开 CORS。未配置 relay
 * （RELAY_BASE_URL 为空）时安全空跑。email/短信码登录没有可托管会话,则只有客户端调度。
 */
import { POLLER_REFRESH_PENDING_KEY } from './authApi'
import { RELAY_BASE_URL, SCHEDULE_PATH, isRelayConfigured } from '../config/scheduling'

export interface SleepScheduleUpload {
  enabled: boolean
  sleepFrom: string // "HH:MM"
  sleepTo: string   // "HH:MM"
  model: string
}

function getUserId(): string | null {
  return localStorage.getItem('iot_user_id')
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Upload (or update/disable) a device's sleep schedule to the relay. Best-effort:
 * never throws, returns false when the relay is unconfigured or the call fails —
 * the client-side scheduler keeps working regardless.
 */
export async function uploadSleepSchedule(
  deviceId: string,
  schedule: SleepScheduleUpload
): Promise<boolean> {
  if (!isRelayConfigured()) return false
  try {
    let boot: { accessToken?: string; refreshToken?: string; accessExpiresAt?: number } = {}
    const rawBoot = localStorage.getItem(POLLER_REFRESH_PENDING_KEY)
    if (rawBoot) { try { boot = JSON.parse(rawBoot) } catch { /* ignore malformed */ } }

    const res = await fetch(`${RELAY_BASE_URL}${SCHEDULE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: getUserId() ?? undefined,
        deviceId: String(deviceId),
        schedule: { ...schedule, tz: deviceTimezone() },
        // One-time poller-session bootstrap (see file header); undefined => relay
        // keeps its own poller-rotated copy.
        refreshToken: boot.refreshToken ?? undefined,
        accessToken: boot.accessToken ?? undefined,
        accessExpiresAt: boot.accessExpiresAt ?? undefined,
      }),
    })
    const ok = res.ok
    // Consume the bootstrap once the relay has it, so we never re-upload a stale pair.
    if (ok && rawBoot) localStorage.removeItem(POLLER_REFRESH_PENDING_KEY)
    return ok
  } catch (e) {
    console.warn('[schedule] uploadSleepSchedule failed:', e)
    return false
  }
}
