/**
 * 原生推送（APNs / FCM）接线 — 仅在 Capacitor 原生平台生效。
 *
 * 流程：
 *   1) 请求通知权限并 register() → 触发 'registration' 事件拿到 token
 *   2) 把 token 上报后端（registerNativePushToken），与 userId 绑定
 *   3) 'pushNotificationReceived'（前台收到）→ 用 LocalNotifications 弹出
 *   4) 'pushNotificationActionPerformed'（点击通知）→ 跳转 App
 *
 * Web 平台所有函数安全空跑（no-op）。后端需实现 NATIVE_TOKEN_PATH 端点，
 * 并用对应平台的密钥（APNs / FCM）向 token 推送。
 */
import { Capacitor } from '@capacitor/core'
import { registerNativePushToken, unregisterNativePushToken } from '../api/webPushApi'

let initialized = false
let lastToken: string | null = null

/** 初始化原生推送监听并注册 token。重复调用安全（幂等）。 */
export async function initNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) return
  initialized = true
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // 权限
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') {
      initialized = false
      return
    }

    // token 注册成功 → 上报后端
    await PushNotifications.addListener('registration', (token) => {
      lastToken = token.value
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
      void registerNativePushToken(token.value, platform)
    })

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[NativePush] registration error:', err)
    })

    // 前台收到推送 → 用本地通知呈现（部分系统前台不自动弹）
    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        await LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Date.now() % 2147483647),
            title: notification.title ?? 'Sierro',
            body: notification.body ?? '',
          }],
        })
      } catch { /* ignore */ }
    })

    // 点击通知 → 聚焦 App（路由跳转可按 data.type 扩展）
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[NativePush] action performed:', action.notification?.data)
    })

    // 触发 token 注册（APNs/FCM）
    await PushNotifications.register()
  } catch (e) {
    console.warn('[NativePush] init failed:', e)
    initialized = false
  }
}

/** 登出时注销 token，并移除监听。 */
export async function teardownNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    if (lastToken) { await unregisterNativePushToken(lastToken); lastToken = null }
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.removeAllListeners()
  } catch { /* ignore */ }
  initialized = false
}
