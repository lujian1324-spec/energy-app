// 推送通知服务 - 使用 Web Push API + Service Worker（PWA）；
// 原生 Capacitor 平台改用 @capacitor/local-notifications（WebView 无 Web Notification）
import { Capacitor } from '@capacitor/core'

// Service Worker 注册实例
let swRegistration: ServiceWorkerRegistration | null = null

// 检查是否是 iOS 设备
export const isIOS = (): boolean => {
  const userAgent = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(userAgent)
}

// 检查是否是 iOS PWA 模式
export const isIOSPWA = (): boolean => {
  return isIOS() && (window.navigator as any).standalone === true
}

// 检查浏览器是否支持通知
export const isNotificationSupported = (): boolean => {
  // iOS 16.4+ 支持 Web Push，但必须在 PWA 模式下
  if (isIOS()) {
    const userAgent = window.navigator.userAgent
    const match = userAgent.match(/OS (\d+)_(\d+)/)
    if (match) {
      const major = parseInt(match[1], 10)
      const minor = parseInt(match[2], 10)
      // iOS 16.4+ 才支持 Web Push
      if (major > 16 || (major === 16 && minor >= 4)) {
        return 'Notification' in window && 'serviceWorker' in navigator
      }
    }
    return false
  }
  return 'Notification' in window && 'serviceWorker' in navigator
}

// 获取 iOS 推送支持状态
export const getIOSPushStatus = (): { supported: boolean; isPWA: boolean; message: string } => {
  if (!isIOS()) {
    return { supported: true, isPWA: false, message: 'Not iOS device' }
  }
  
  const userAgent = window.navigator.userAgent
  const match = userAgent.match(/OS (\d+)_(\d+)/)
  if (!match) {
    return { supported: false, isPWA: false, message: '无法检测 iOS 版本' }
  }
  
  const major = parseInt(match[1], 10)
  const minor = parseInt(match[2], 10)
  
  if (major < 16 || (major === 16 && minor < 4)) {
    return { 
      supported: false, 
      isPWA: false, 
      message: `iOS ${major}.${minor} 不支持 Web Push，请升级到 iOS 16.4+` 
    }
  }
  
  const pwa = isIOSPWA()
  if (!pwa) {
    return { 
      supported: false, 
      isPWA: false, 
      message: 'iOS 推送需要将应用添加到主屏幕（PWA模式）' 
    }
  }
  
  return { supported: true, isPWA: true, message: 'iOS Web Push 已就绪' }
}

// 获取基础路径（用于 GitHub Pages 子路径部署）
const getBasePath = () => {
  const baseUrl = (import.meta as any).env?.BASE_URL || '/'
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

// 原生平台通知权限缓存（WebView 无 Notification.permission，需经插件异步读取后缓存）
let nativeNotifState: NotificationPermission = 'default'

/** 刷新原生通知权限缓存（App 启动 / 授权后调用）。Web 平台为 no-op。 */
export const refreshNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!Capacitor.isNativePlatform()) return getNotificationPermission()
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.checkPermissions()
    nativeNotifState = display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default'
  } catch {
    nativeNotifState = 'default'
  }
  return nativeNotifState
}

// 获取通知权限状态
export const getNotificationPermission = (): NotificationPermission => {
  // 原生平台：返回缓存值（由 refreshNotificationPermission 维护）
  if (Capacitor.isNativePlatform()) return nativeNotifState
  if (!isNotificationSupported()) {
    return 'denied'
  }
  return Notification.permission
}

// 注册 Service Worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported')
    return null
  }

  try {
    // 检查是否已注册
    if (swRegistration) {
      return swRegistration
    }

    // 获取基础路径并注册 Service Worker
    const basePath = getBasePath()
    const swPath = `${basePath}sw.js`.replace(/\/+/g, '/')
    
    console.log('[Push] Registering Service Worker at:', swPath)
    swRegistration = await navigator.serviceWorker.register(swPath)
    console.log('[Push] Service Worker registered:', swRegistration.scope)
    
    return swRegistration
  } catch (error) {
    console.error('[Push] Service Worker registration failed:', error)
    return null
  }
}

// 请求通知权限
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!isNotificationSupported()) {
    console.warn('Push notifications not supported')
    return 'denied'
  }

  try {
    // 先注册 Service Worker（确保锁屏推送能工作）
    await registerServiceWorker()
    
    const permission = await Notification.requestPermission()
    return permission
  } catch (error) {
    console.error('Error requesting notification permission:', error)
    return 'denied'
  }
}

// 显示本地通知 - 使用 Service Worker 以确保锁屏状态下也能显示
export const showLocalNotification = async (
  title: string,
  options?: NotificationOptions
): Promise<void> => {
  // 原生 (Capacitor): WebView 不暴露 Web Notification API，改用 LocalNotifications 插件
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const perm = await LocalNotifications.checkPermissions()
      if (perm.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions()
        if (req.display !== 'granted') return
      }
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Date.now() % 2147483647),
          title,
          body: (options?.body as string) ?? '',
          // smallIcon/sound use native defaults; tag-equivalent grouping via channelId
        }],
      })
    } catch (e) {
      console.warn('[Native] LocalNotifications failed:', e)
    }
    return
  }
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported')
    const iosStatus = getIOSPushStatus()
    if (!iosStatus.supported) {
      console.warn('[Push] iOS Status:', iosStatus.message)
    }
    return
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted')
    return
  }

  try {
    // 确保 Service Worker 已注册
    const registration = await registerServiceWorker()
    
    if (registration) {
      // iOS 特殊处理：等待 SW 激活
      if (isIOS()) {
        await waitForServiceWorkerActive(registration)
      }
      
      // 使用 Service Worker 显示通知 - 支持锁屏状态
      const isIOSDevice = isIOS()
      const notificationOptions: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
        icon: `${getBasePath()}/icon-192x192.png`,
        // iOS badge 图标 - 使用 192x192 作为备用
        badge: `${getBasePath()}/badge-96.png`,
        tag: 'sierro-alert',
        // 重要：iOS 需要 renotify 才能在锁屏时重复提醒相同 tag 的通知
        renotify: true,
        // iOS 不支持 requireInteraction
        requireInteraction: !isIOSDevice,
        // 重要：iOS 上 silent 必须为 false 才能显示在锁屏
        silent: false,
        ...options,
      }
      
      // 非 iOS 设备添加额外选项
      if (!isIOSDevice) {
        notificationOptions.vibrate = [200, 100, 200]
      } else {
        // iOS：移除不支持的属性
        delete (notificationOptions as any).vibrate
        delete (notificationOptions as any).requireInteraction
        delete (notificationOptions as any).actions
      }
      
      console.log('[Push] Showing notification with options:', JSON.stringify(notificationOptions))
      
      await registration.showNotification(title, notificationOptions)
      console.log('[Push] Notification shown via Service Worker')
    } else {
      // 降级：使用传统 Notification API（不推荐用于 iOS 锁屏推送）
      console.warn('[Push] Falling back to legacy Notification API')
      const notification = new Notification(title, {
        icon: `${getBasePath()}/icon-192x192.png`,
        badge: `${getBasePath()}/badge-96.png`,
        tag: 'sierro-alert',
        requireInteraction: true,
        ...options,
      })
      
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  } catch (error) {
    console.error('Error showing notification:', error)
  }
}

// 等待 Service Worker 激活（iOS 需要）
const waitForServiceWorkerActive = async (
  registration: ServiceWorkerRegistration
): Promise<void> => {
  if (registration.active) return
  
  return new Promise((resolve) => {
    const checkState = () => {
      if (registration.active) {
        resolve()
      } else {
        setTimeout(checkState, 100)
      }
    }
    checkState()
  })
}

// 显示断电警报通知
export const showPowerOutageNotification = async (
  soc: number = 90,
  remainingHours: string = '—'
): Promise<void> => {
  const basePath = getBasePath()
  const isIOSDevice = isIOS()

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: `The remaining ${soc}% battery will last up to ${remainingHours} hours.`,
    icon: `${basePath}/icon-192x192.png`,
    badge: `${basePath}/badge-96.png`,
    tag: 'power-outage-alert',
    renotify: true,
    requireInteraction: !isIOSDevice,
    silent: false,
    data: {
      type: 'power-outage',
      timestamp: Date.now(),
    },
  }

  if (!isIOSDevice) {
    options.vibrate = [200, 100, 200]
  }

  await showLocalNotification('Power outage. Backup activated.', options)
}

// 显示低电量通知
export const showLowBatteryNotification = async (
  soc: number,
  threshold: number
): Promise<void> => {
  const basePath = getBasePath()
  const isIOSDevice = isIOS()

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: `Battery is at ${soc}%. Connect a power source to keep your devices running.`,
    icon: `${basePath}/icon-192x192.png`,
    badge: `${basePath}/badge-96.png`,
    tag: `low-battery-${threshold}`,
    renotify: false,
    requireInteraction: !isIOSDevice,
    silent: false,
    data: { type: 'low-battery', soc, threshold, timestamp: Date.now() },
  }

  if (!isIOSDevice) {
    options.vibrate = [200, 100, 200]
  }

  await showLocalNotification(`Low Battery: ${soc}%`, options)
}

// 显示太阳能开始充电通知
export const showSolarChargingNotification = async (solarW: number): Promise<void> => {
  const basePath = getBasePath()
  const options: NotificationOptions & { renotify?: boolean } = {
    body: `Solar panels are generating ${solarW}W. Your battery is now charging.`,
    icon: `${basePath}/icon-192x192.png`,
    badge: `${basePath}/badge-96.png`,
    tag: 'solar-charging',
    renotify: false,
  }
  await showLocalNotification('Solar charging started ☀️', options)
}

// 订阅 Push 服务（用于服务器推送）
export const subscribeToPush = async (
  vapidPublicKey?: string
): Promise<PushSubscription | null> => {
  if (!isNotificationSupported()) {
    console.warn('Push API not supported')
    return null
  }

  try {
    const registration = await registerServiceWorker()
    if (!registration) return null

    // 检查是否已有订阅
    let subscription = await registration.pushManager.getSubscription()
    
    if (!subscription && vapidPublicKey) {
      // 创建新订阅
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource
      })
      console.log('[Push] Subscribed to push:', subscription)
    }
    
    return subscription
  } catch (error) {
    console.error('[Push] Subscription failed:', error)
    return null
  }
}

// 取消 Push 订阅
export const unsubscribeFromPush = async (): Promise<boolean> => {
  try {
    const registration = await registerServiceWorker()
    if (!registration) return false

    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
      console.log('[Push] Unsubscribed from push')
      return true
    }
    return false
  } catch (error) {
    console.error('[Push] Unsubscribe failed:', error)
    return false
  }
}

// ─── 服务端 Web Push 编排（订阅 + 上报后端，App 关闭也能收到） ─────────────────
import { VAPID_PUBLIC_KEY, isWebPushConfigured } from '../config/webPush'
import { registerPushSubscription, unregisterPushSubscription } from '../api/webPushApi'

/**
 * 启用服务端 Web Push：请求权限 → 订阅 Push 服务 → 上报后端。
 * 返回 true 表示订阅成功（后端上报失败仍返回 true，订阅本身有效）。
 * 未配置 VAPID 公钥时直接返回 false（仅依赖前台监控）。
 */
export const enableWebPush = async (): Promise<boolean> => {
  if (!isWebPushConfigured()) {
    console.info('[WebPush] VAPID public key not configured — skipping server push subscription')
    return false
  }
  if (getNotificationPermission() !== 'granted') {
    const perm = await requestNotificationPermission()
    if (perm !== 'granted') return false
  }
  const subscription = await subscribeToPush(VAPID_PUBLIC_KEY)
  if (!subscription) return false
  await registerPushSubscription(subscription) // best-effort，后端未就绪不影响订阅
  return true
}

/** 关闭服务端 Web Push：通知后端注销 + 取消浏览器订阅。 */
export const disableWebPush = async (): Promise<void> => {
  try {
    const registration = await registerServiceWorker()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await unregisterPushSubscription(subscription.endpoint)
      await unsubscribeFromPush()
    }
  } catch (e) {
    console.warn('[WebPush] disableWebPush failed:', e)
  }
}

/**
 * 幂等同步：App 启动 / 登录后调用。
 * 若已授予权限且任一推送开关开启，则确保存在有效订阅并已上报后端。
 * 用于覆盖订阅过期（pushsubscriptionchange）或换设备登录的情况。
 */
export const syncWebPushSubscription = async (anyPushEnabled: boolean): Promise<void> => {
  if (!isWebPushConfigured()) return
  if (!anyPushEnabled) return
  if (getNotificationPermission() !== 'granted') return
  const subscription = await subscribeToPush(VAPID_PUBLIC_KEY)
  if (subscription) await registerPushSubscription(subscription)
}

// 辅助函数：将 base64 字符串转换为 Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')
  
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
