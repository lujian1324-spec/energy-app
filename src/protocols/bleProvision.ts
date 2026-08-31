/**
 * BLE 配网管理器（采集器蓝牙配网规程 v2.9）
 *
 * Service FEE7 · Write FED5 · Indicate FED6 · MTU 240
 * 发送: JSON → AES(md5(DTUID+"SEC_")) → Base64 → 分包 → Write(FED5)
 * 接收: Indicate(FED6) → 收集分包 → 组包 → Base64 → AES 解密 → JSON
 *
 * 双后端：
 *   - WebBleProvisionManager   : Web Bluetooth（PWA / Android Chrome）
 *   - NativeBleProvisionManager: @capacitor-community/bluetooth-le（原生 App）
 * getProvisionManager() 按 Capacitor.isNativePlatform() 选择，UI 无需感知差异。
 */
