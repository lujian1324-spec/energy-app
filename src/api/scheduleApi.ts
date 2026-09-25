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
 * （RELAY_BASE_URL 为空）时安全空跑。验证码登录也会尝试建立独立会话，但可能失败。
 */
import { POLLER_REFRESH_PENDING_KEY } from './authApi'
import { RELAY_BASE_URL, SCHEDULE_PATH, isRelayConfigured } from '../config/scheduling'
import { tokenStore } from '../utils/apiClient'
import type { ScheduleMode } from '../utils/activeScheduleMode'

export interface SleepScheduleUpload {
  enabled: boolean
  sleepFrom: string // "HH:MM"
  sleepTo: string   // "HH:MM"
  model: string
  /**
   * Explicit AC charge power (W) for inside / outside the window. Both features
   * send them: Sleep Mode its two slider values (v4.18.0), Smart Schedule (SW-08)
   * the rate typed by the user and 0W outside the window. The relay derives them
   * from `model` only for an upload from an older client that omits them.
   */
  sleepW?: number
  wakeW?: number
  /**
   * SW-14 — which feature this window belongs to. The relay holds one schedule
   * slot per device and ticks it with the app closed, so pausing Smart Schedule
   * on the client alone would leave the background writes running. Tagging the
   * upload is what lets `server/sleepExecutor.js` skip the Smart Schedule ones
   * and keep firing Sleep Mode's.
   *
   * Optional because a relay entry saved before this has no tag; the relay
   * treats an untagged window as Sleep Mode's and keeps executing it, which is
   * the safe default for the feature that is not paused.
   */
  mode?: ScheduleMode
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
 * What the relay did with an upload (SW-12).
 *
 * `uploadSleepSchedule` collapsed "no relay is configured" and "the relay
 * refused the window" into one `false`, so callers could not tell a build
 * without background scheduling from a background schedule that was rejected —
 * and both were reported to the user as a clean save. `configured` separates
 * them; `detail` carries the refusal for the existing error channel.
 */
export interface ScheduleUploadResult {
  /** Does this build have a relay at all? False ⇒ client-side timing only, by design. */
  configured: boolean
  /** Did the relay take the window? Only meaningful when `configured`. */
  accepted: boolean
  status?: number
  detail?: string
}

/**
 * Upload (or update/disable) a device's sleep schedule to the relay. Best-effort:
 * never throws, returns false when the relay is unconfigured or the call fails —
 * the client-side scheduler keeps working regardless.
 *
 * Prefer `uploadSleepScheduleResult` when the outcome is shown to the user: this
 * boolean cannot distinguish "no relay in this build" from "the relay said no".
 */
export async function uploadSleepSchedule(
  deviceId: string,
  schedule: SleepScheduleUpload
): Promise<boolean> {
  return (await uploadSleepScheduleResult(deviceId, schedule)).accepted
}

/** As `uploadSleepSchedule`, but says *why* a window did not reach the relay. */
export async function uploadSleepScheduleResult(
  deviceId: string,
  schedule: SleepScheduleUpload
): Promise<ScheduleUploadResult> {
  if (!isRelayConfigured()) return { configured: false, accepted: false }
  try {
    const userId = getUserId()?.trim()
    if (!userId || ['anon', 'null', 'undefined'].includes(userId)) {
      return { configured: true, accepted: false, detail: 'Sign in again before saving a background schedule.' }
    }
    let boot: { accessToken?: string; refreshToken?: string; accessExpiresAt?: number } = {}
    const rawBoot = localStorage.getItem(POLLER_REFRESH_PENDING_KEY)
    if (rawBoot) { try { boot = JSON.parse(rawBoot) ?? {} } catch { /* ignore malformed */ } }

    const res = await fetch(`${RELAY_BASE_URL}${SCHEDULE_PATH}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', ...(tokenStore.get() ? { 'IOT-Token': tokenStore.get()! } : {}) },
      body: JSON.stringify({
        userId,
        deviceId: String(deviceId),
        schedule: { ...schedule, tz: deviceTimezone() },
        // One-time poller-session bootstrap (see file header); undefined => relay
        // keeps its own poller-rotated copy.
        refreshToken: boot.refreshToken ?? undefined,
        accessToken: boot.accessToken ?? undefined,
        accessExpiresAt: boot.accessExpiresAt ?? undefined,
      }),
    })
    const body = await res.json().catch(() => null)
    const ok = res.ok && (body?.code === 0 || body?.code === '0')
    // A concurrent login can replace the bootstrap while this upload is in flight.
    if (ok && rawBoot && getUserId()?.trim() === userId && localStorage.getItem(POLLER_REFRESH_PENDING_KEY) === rawBoot) {
      localStorage.removeItem(POLLER_REFRESH_PENDING_KEY)
    }
    const missingSession = res.status === 409 && (
      body?.reason === 'POLLER_SESSION_REQUIRED'
      || body?.message === 'A poller session is required for background scheduling. Sign in again.'
    )
    return {
      configured: true,
      accepted: ok,
      status: typeof res.status === 'number' ? res.status : undefined,
      detail: ok ? undefined : missingSession
        ? 'Background session is missing. Sign in again and retry Save. If it still fails, contact support.'
        : `Schedule server did not confirm the save (HTTP ${res.status}). Retry Save.`,
    }
  } catch (e) {
    console.warn('[schedule] uploadSleepSchedule failed:', e)
    return {
      configured: true,
      accepted: false,
      detail: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
        ? 'Schedule server timed out. Check your connection and retry Save.'
        : 'Schedule server could not be reached. Check your connection and retry Save.',
    }
  }
}
