// Service Worker for Sierro App - Push Notifications

const CACHE_NAME = 'sierro-app-v2';

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
  // 强制激活，确保立即接管
  event.waitUntil(self.skipWaiting());
});

// 激活时清理旧缓存并立即接管
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...');
  event.waitUntil(
    Promise.all([
      // 清理旧缓存
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      }),
      // 立即接管所有客户端
      self.clients.claim()
    ])
  );
});

// 检测是否是 iOS 设备
const isIOS = () => {
  const userAgent = self.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

// 获取 iOS 版本
const getIOSVersion = () => {
  const userAgent = self.navigator.userAgent;
  const match = userAgent.match(/OS (\d+)_(\d+)/);
  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10)
    };
  }
  return null;
};

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
  
  // iOS 特殊处理
  const isIOSDevice = isIOS();
  const iosVersion = getIOSVersion();
  // iOS 16.4+ 才支持 Web Push
  const isModernIOS = isIOSDevice && iosVersion && (iosVersion.major > 16 || (iosVersion.major === 16 && iosVersion.minor >= 4));
  
  // 基础选项 - 所有平台通用
  const options = {
    body: data.body || 'Power outage. Backup activated.',
    icon: data.icon || `${basePath}/icon-192x192.png`,
    // iOS badge 图标 - 使用 192x192 作为备用
    badge: data.badge || `${basePath}/icon-192x192.png`,
    tag: data.tag || 'sierro-alert',
    // 重要：iOS 需要 renotify 才能在锁屏时重复提醒相同 tag 的通知
    renotify: true,
    // 重要：iOS 不支持 requireInteraction，设为 undefined
    requireInteraction: isIOSDevice ? undefined : (data.requireInteraction !== false),
    // 重要：iOS 上 silent 必须为 false 才能显示在锁屏
    silent: false,
    // 通知优先级 - 帮助 iOS 决定是否显示在锁屏
    urgency: 'high',
    data: data.data || { type: 'power-outage', timestamp: Date.now() },
  };
  
  // 非 iOS 设备添加额外选项
  if (!isIOSDevice) {
    options.vibrate = data.vibrate || [200, 100, 200];
    options.actions = data.actions || [
      { action: 'dismiss', title: 'Dismiss' },
      { action: 'view', title: 'View Details' }
    ];
  }

  console.log('[SW] Showing notification with options:', JSON.stringify(options));

  // 显示通知 - 即使在锁屏状态下也能显示
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('[SW] Notification shown successfully');
      })
      .catch((err) => {
        console.error('[SW] Failed to show notification:', err);
      })
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
