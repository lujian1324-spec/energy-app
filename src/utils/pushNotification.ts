// 推送通知服务 - 使用 Web Push API + Service Worker

// Service Worker 注册实例
let swRegistration: ServiceWorkerRegistration | null = null

// 检查浏览器是否支持通知
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window && 'serviceWorker' in navigator
}

// 获取通知权限状态
export const getNotificationPermission = (): NotificationPermission => {
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
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported')
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
      // 使用 Service Worker 显示通知 - 支持锁屏状态
      await registration.showNotification(title, {
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'sierro-alert',
        requireInteraction: true,
        vibrate: [200, 100, 200],
        ...options,
      })
      console.log('[Push] Notification shown via Service Worker')
    } else {
      // 降级：使用传统 Notification API
      const notification = new Notification(title, {
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
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

// 显示断电警报通知
export const showPowerOutageNotification = async (): Promise<void> => {
  await showLocalNotification('Power outage. Backup activated.', {
    body: 'The remaining 76% battery will last up to 16 hours.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'power-outage-alert',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      type: 'power-outage',
      timestamp: Date.now(),
    },
  })
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
        applicationServerKey
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
