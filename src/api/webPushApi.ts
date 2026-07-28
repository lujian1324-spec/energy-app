/**
 * Web Push 订阅上报 API
 * 把浏览器 PushSubscription 注册到后端（与 userId 绑定），以及注销。
 * 端点路径见 src/config/webPush.ts，待后端实现后调整。
 */
import { api, isApiSuccess } from '../utils/apiClient'
import { POLLER_REFRESH_PENDING_KEY } from './authApi'
import { usePowerStationStore } from '../stores/powerStationStore'
import {
  PUSH_SUBSCRIBE_PATH,
  PUSH_UNSUBSCRIBE_PATH,
  NATIVE_TOKEN_PATH,
  NATIVE_TOKEN_UNREGISTER_PATH,
} from '../config/webPush'
import { RELAY_BASE_URL, isRelayConfigured } from '../config/scheduling'

function getUserId(): string | null {
  return localStorage.getItem('iot_user_id')
}

/**
 * Push preferences the server-side poller needs to watch this user's devices
 * while the app is CLOSED (matches the Settings > Push Notifications toggles).
 */
function getPushPrefs() {
  const s = usePowerStationStore.getState().settings
  return {
    pushNotifications: s.pushNotifications ?? false,
    pushLowBattery: s.pushLowBattery ?? false,
    lowBatteryThreshold: s.lowBatteryThreshold ?? 30,
    pushSolarStatus: s.pushSolarStatus ?? false,
    pushDeviceAlarms: s.pushDeviceAlarms ?? false,
  }
}

/** 上报订阅到后端。成功返回 true；后端未就绪/失败返回 false（不抛错）。 */
export async function registerPushSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const json = sub.toJSON()
    // One-time bootstrap: the access+refresh pair of the dedicated poller session
    // minted at password login (see authApi.provisionPollerSession). Sent ONLY on
    // the first subscribe after login — thereafter the relay's poller owns and
    // rotates it, so we must NOT re-upload a now-stale copy. Absent for email/SMS
    // logins (no password to mint a second session).
    let boot: { accessToken?: string; refreshToken?: string; accessExpiresAt?: number } = {}
    const rawBoot = localStorage.getItem(POLLER_REFRESH_PENDING_KEY)
    if (rawBoot) { try { boot = JSON.parse(rawBoot) } catch { /* ignore malformed */ } }
    const res = await api.post(PUSH_SUBSCRIBE_PATH, {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userId: getUserId() ?? undefined,
      platform: 'web',
      expirationTime: sub.expirationTime ?? null,
      // Lets the poller read this user's device state via its own independent
      // session; refreshToken stored encrypted by the relay. undefined => relay
      // keeps its own (poller-rotated) copy.
      refreshToken: boot.refreshToken ?? undefined,
      accessToken: boot.accessToken ?? undefined,
      accessExpiresAt: boot.accessExpiresAt ?? undefined,
      prefs: getPushPrefs(),
    })
    const ok = isApiSuccess(res.code)
    // Consume the bootstrap once the relay has it, so we never re-upload a stale one.
    if (ok && rawBoot) localStorage.removeItem(POLLER_REFRESH_PENDING_KEY)
    return ok
  } catch (e) {
    console.warn('[WebPush] registerPushSubscription failed:', e)
    return false
  }
}

/** 通知后端注销该订阅。失败静默。 */
export async function unregisterPushSubscription(endpoint: string): Promise<boolean> {
  try {
    const res = await api.post(PUSH_UNSUBSCRIBE_PATH, {
      endpoint,
      userId: getUserId() ?? undefined,
    })
    return isApiSuccess(res.code)
  } catch (e) {
    console.warn('[WebPush] unregisterPushSubscription failed:', e)
    return false
  }
}

/** relay 直连 POST（走 VITE_RELAY_URL，非官方 api——relay 不校验 IOT-Token/签名）。 */
async function relayPost(path: string, body: unknown): Promise<Response | null> {
  if (!isRelayConfigured()) return null
  return fetch(`${RELAY_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** 读取密码登录时 provisionPollerSession 存下的一次性 poller 会话 bootstrap。 */
function readPollerBootstrap(): { accessToken?: string; refreshToken?: string; accessExpiresAt?: number } {
  try {
    const raw = localStorage.getItem(POLLER_REFRESH_PENDING_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * 上报原生推送 token（APNs/FCM）到 RELAY，并附带 poller 会话 bootstrap + 当前推送
 * prefs——relay 的 poller 据此在 App 关闭时轮询该用户设备、按 prefs 判断三类告警
 * （市电故障/低电量/光伏状态）并推送。会话为一次性 bootstrap（成功后消费），之后的
 * prefs 变更再次调用本函数即可（不带会话，relay 侧只更新 prefs）。未配置 relay 时
 * 安全空跑。失败静默。
 */
export async function registerNativePushToken(token: string, platform: 'ios' | 'android'): Promise<boolean> {
  try {
    const boot = readPollerBootstrap()
    const hadBoot = !!(boot.refreshToken || boot.accessToken)
    const res = await relayPost(NATIVE_TOKEN_PATH, {
      token,
      platform,
      userId: getUserId() ?? undefined,
      prefs: getPushPrefs(),
      refreshToken: boot.refreshToken ?? undefined,
      accessToken: boot.accessToken ?? undefined,
      accessExpiresAt: boot.accessExpiresAt ?? undefined,
    })
    const ok = !!res && res.ok
    // 消费一次性 bootstrap，避免之后重传已被 poller 轮换的旧副本。
    if (ok && hadBoot) { try { localStorage.removeItem(POLLER_REFRESH_PENDING_KEY) } catch { /* ignore */ } }
    return ok
  } catch (e) {
    console.warn('[NativePush] registerNativePushToken failed:', e)
    return false
  }
}

/** 通知 relay 注销该原生 token。失败静默。 */
export async function unregisterNativePushToken(token: string): Promise<boolean> {
  try {
    const res = await relayPost(NATIVE_TOKEN_UNREGISTER_PATH, {
      token,
      userId: getUserId() ?? undefined,
    })
    return !!res && res.ok
  } catch (e) {
    console.warn('[NativePush] unregisterNativePushToken failed:', e)
    return false
  }
}
