// Web Push handlers — imported into the Workbox-generated service worker
// via vite-plugin-pwa `workbox.importScripts`. Keep ONLY push/notification
// event listeners here; caching + install/activate are owned by Workbox.

// 基础路径（GitHub Pages 子路径部署）
const getBasePath = () => {
  try {
    const url = new URL(self.registration.scope)
    return url.pathname.replace(/\/$/, '') || ''
  } catch {
    return ''
  }
}

const isIOS = () => /iphone|ipad|ipod/.test((self.navigator.userAgent || '').toLowerCase())

// 推送事件 — App 关闭/锁屏时由后端推送触发
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'SIERRO', body: 'New notification' }
  }

  const basePath = getBasePath()
  const title = data.title || 'SIERRO'
  const isIOSDevice = isIOS()

  const options = {
    body: data.body || 'New notification',
    icon: data.icon || `${basePath}/icon-192x192.png`,
    badge: data.badge || `${basePath}/icon-192x192.png`,
    tag: data.tag || 'sierro-alert',
    renotify: true,
    requireInteraction: isIOSDevice ? undefined : (data.requireInteraction !== false),
    silent: false,
    urgency: 'high',
    data: data.data || { type: data.type || 'alert', timestamp: Date.now() },
  }

  if (!isIOSDevice) {
    options.vibrate = data.vibrate || [200, 100, 200]
    options.actions = data.actions || [
      { action: 'dismiss', title: 'Dismiss' },
      { action: 'view', title: 'View Details' },
    ]
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// 点击通知 — 聚焦或打开应用
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const basePath = getBasePath()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.focus) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(`${basePath}/`)
    })
  )
})

self.addEventListener('notificationclose', () => {})

// 订阅过期/变更 — 应用下次启动时 syncWebPushSubscription 会重新订阅并上报
self.addEventListener('pushsubscriptionchange', () => {
  // no-op here; re-subscription handled in-app on next launch
})

// 与主应用通信：手动展示通知（前台降级路径）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data.payload
    self.registration.showNotification(title, options)
  }
})
