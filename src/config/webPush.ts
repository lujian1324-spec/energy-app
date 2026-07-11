/**
 * Web Push 配置
 *
 * 要真正实现“App 关闭也能收到低电量/停电系统通知”，需要服务端 Web Push：
 *   1) 后端生成一对 VAPID 密钥，把【公钥】通过 VITE_VAPID_PUBLIC_KEY 注入前端；
 *   2) 前端用公钥向浏览器 Push 服务订阅，得到 PushSubscription；
 *   3) 前端把订阅(endpoint + p256dh + auth)上报后端保存，并与 userId 绑定；
 *   4) 设备触发告警时，后端用【私钥】向该 endpoint 推送消息，sw.js 的 'push'
 *      事件即可在 App 关闭/锁屏时弹出系统通知。
 *
 * 未配置 VAPID 公钥时，所有 Web Push 调用都会安全地空跑（no-op），App 仍可
 * 依赖前台/后台存活时的 useLowBatteryMonitor。
 */

/**
 * 推送功能总开关。默认关闭：APNs 授权文件 / FCM google-services.json / 后端
 * token 注册与下发尚未就绪，此时推送无法真正送达。关闭时隐藏所有推送开关，
 * 且启动与权限引导都不申请通知权限（避免"申请了却不能用"被商店拒审）。
 * 后端与原生推送凭据就绪后，构建时设 VITE_PUSH_ENABLED=true 打开完整链路。
 */
export const PUSH_ENABLED: boolean = import.meta.env.VITE_PUSH_ENABLED === 'true'

/**
 * 原生推送（APNs/FCM）凭据就绪总开关。默认关闭：android/app/google-services.json
 * 未提交到仓库（build.gradle 检测不到文件时跳过 google-services 插件，
 * FirebaseApp 从未初始化），iOS 侧 APNs 也未接后端下发。此时调用
 * PushNotifications.register() → FirebaseMessaging.getInstance() 会因
 * "Default FirebaseApp is not initialized" 失败/异常。
 * PUSH_ENABLED 打开后应用会在权限引导/登录后请求通知权限并尝试 register()——
 * 该权限请求本身无害，但 register() 在没有真实凭据时不安全，所以单独用这个
 * 开关兜底，与 PUSH_ENABLED 解耦。放好 google-services.json + APNs 证书后，
 * 构建时设 VITE_NATIVE_PUSH_READY=true 才真正调用 register()。
 */
export const NATIVE_PUSH_READY: boolean = import.meta.env.VITE_NATIVE_PUSH_READY === 'true'

/** VAPID 公钥（base64url）。由后端提供，部署时通过环境变量注入。 */
export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/** 是否已配置 Web Push（有 VAPID 公钥才启用服务端推送链路）。 */
export const isWebPushConfigured = (): boolean => VAPID_PUBLIC_KEY.trim().length > 0

/** 后端订阅上报 / 注销端点（待后端实现后按实际路径调整）。 */
export const PUSH_SUBSCRIBE_PATH = '/notification/webpush/subscribe'
export const PUSH_UNSUBSCRIBE_PATH = '/notification/webpush/unsubscribe'

/** 原生推送 token（APNs/FCM）上报 / 注销端点。 */
export const NATIVE_TOKEN_PATH = '/notification/nativepush/register'
export const NATIVE_TOKEN_UNREGISTER_PATH = '/notification/nativepush/unregister'
