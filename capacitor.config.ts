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
