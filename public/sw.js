// Service Worker for Sierro App - Push Notifications

const CACHE_NAME = 'sierro-app-v1';

// 获取基础路径（用于 GitHub Pages 子路径部署）
const getBasePath = () => {
  // 从 Service Worker 的 scope 推断基础路径
  const scope = self.registration.scope;
  const url = new URL(scope);
  // 如果路径以 / 结尾，去掉末尾的 /
  return url.pathname.replace(/\/$/, '') || '';
};

// 安装时缓存必要资源
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...');
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

// 处理推送事件 - 这是锁屏状态下接收通知的关键
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event);

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'SIERRO', body: 'New notification' };
  }

  const basePath = getBasePath();
  const title = data.title || 'SIERRO';
  const options = {
    body: data.body || 'Power outage. Backup activated.',
    icon: data.icon || `${basePath}/icon-192x192.png`,
    badge: data.badge || `${basePath}/icon-192x192.png`,
    tag: data.tag || 'sierro-alert',
    requireInteraction: data.requireInteraction !== false,
    silent: false,
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data || { type: 'power-outage', timestamp: Date.now() },
    actions: data.actions || [
      { action: 'dismiss', title: 'Dismiss' },
      { action: 'view', title: 'View Details' }
    ]
  };

  // 显示通知 - 即使在锁屏状态下也能显示
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 处理通知点击事件
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  
  event.notification.close();

  const notificationData = event.notification.data;

  if (event.action === 'dismiss') {
    // 用户点击了 Dismiss 按钮
    return;
  }

  // 打开或聚焦应用窗口
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 如果已有窗口打开，聚焦它
        for (const client of clientList) {
          if (client.url && client.focus) {
            return client.focus();
          }
        }
        // 否则打开新窗口
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

// 处理通知关闭事件
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});

// 订阅变更事件
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');
  // 可以在这里通知服务器更新订阅信息
});

// 消息事件 - 用于与主应用通信
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data.payload;
    self.registration.showNotification(title, options);
  }
});
