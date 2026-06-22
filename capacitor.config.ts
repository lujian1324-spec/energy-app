import type { CapacitorConfig } from '@capacitor/cli'

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
}

export default config
