/**
 * Web Push 订阅上报 API
 * 把浏览器 PushSubscription 注册到后端（与 userId 绑定），以及注销。
 * 端点路径见 src/config/webPush.ts，待后端实现后调整。
 */
import { api, isApiSuccess } from '../utils/apiClient'
import {
  PUSH_SUBSCRIBE_PATH,
  PUSH_UNSUBSCRIBE_PATH,
  NATIVE_TOKEN_PATH,
  NATIVE_TOKEN_UNREGISTER_PATH,
} from '../config/webPush'

function getUserId(): string | null {
  return localStorage.getItem('iot_user_id')
}

/** 上报订阅到后端。成功返回 true；后端未就绪/失败返回 false（不抛错）。 */
export async function registerPushSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const json = sub.toJSON()
    const res = await api.post(PUSH_SUBSCRIBE_PATH, {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userId: getUserId() ?? undefined,
      platform: 'web',
      expirationTime: sub.expirationTime ?? null,
    })
    return isApiSuccess(res.code)
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
