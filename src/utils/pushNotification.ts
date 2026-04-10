// 推送通知服务 - 使用 Web Push API

// 检查浏览器是否支持通知
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window
}

// 获取通知权限状态
export const getNotificationPermission = (): NotificationPermission => {
  if (!isNotificationSupported()) {
    return 'denied'
  }
  return Notification.permission
}

// 请求通知权限
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!isNotificationSupported()) {
    console.warn('Push notifications not supported')
    return 'denied'
  }

  try {
    const permission = await Notification.requestPermission()
    return permission
  } catch (error) {
    console.error('Error requesting notification permission:', error)
    return 'denied'
  }
}

// 显示本地通知
export const showLocalNotification = (
  title: string,
  options?: NotificationOptions
): Notification | null => {
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported')
    return null
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted')
    return null
  }

  try {
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

    return notification
  } catch (error) {
    console.error('Error showing notification:', error)
    return null
  }
}

// 显示断电警报通知
export const showPowerOutageNotification = (): Notification | null => {
  return showLocalNotification('Power outage. Backup activated.', {
    body: 'The remaining 90% battery will last up to 16 hours.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'power-outage-alert',
    requireInteraction: true,
    data: {
      type: 'power-outage',
      timestamp: Date.now(),
    },
  })
}
