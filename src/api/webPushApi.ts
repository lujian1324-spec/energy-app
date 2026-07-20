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

/** 上报原生推送 token（APNs/FCM）到后端，与 userId 绑定。失败静默。 */
export async function registerNativePushToken(token: string, platform: 'ios' | 'android'): Promise<boolean> {
  try {
    const res = await api.post(NATIVE_TOKEN_PATH, {
      token,
      platform,
      userId: getUserId() ?? undefined,
    })
    return isApiSuccess(res.code)
  } catch (e) {
    console.warn('[NativePush] registerNativePushToken failed:', e)
    return false
  }
}

/** 注销原生推送 token。失败静默。 */
export async function unregisterNativePushToken(token: string): Promise<boolean> {
  try {
    const res = await api.post(NATIVE_TOKEN_UNREGISTER_PATH, {
      token,
      userId: getUserId() ?? undefined,
    })
    return isApiSuccess(res.code)
  } catch (e) {
    console.warn('[NativePush] unregisterNativePushToken failed:', e)
    return false
  }
}
