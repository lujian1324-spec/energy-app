import type { CapacitorConfig } from '@capacitor/cli'
import { KeyboardResize } from '@capacitor/keyboard'

const config: CapacitorConfig = {
  appId: 'com.sierro.energyapp',
  appName: 'Sierro Energy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#141414',
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#141414',
    contentInset: 'always',
    // 允许 WKWebView 访问本地文件
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
    // 原生平台把 fetch/XHR 路由到原生 HTTP，绕过 WebView 的 CORS 限制，
    // 并让 apiClient 设置的 Origin/Referer 等头真正发出（WebView fetch 会丢弃
    // 这些禁止头，导致后端按 https://localhost 判跨域而拒绝 → 登录超时）。
    // Web 端为 no-op，行为不变。
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
    },
    SplashScreen: {
      launchAutoHide: true,
      // 品牌启动图为白底黑字 SIERRO（与 App 图标一致）
      backgroundColor: '#FFFFFF',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#01D6BE',
    },
  },
}

export default config
