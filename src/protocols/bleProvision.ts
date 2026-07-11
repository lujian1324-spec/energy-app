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
import {
  BLE_CID,
  BLE_PROVISION_UUIDS,
  type BleProvisionResponse,
  type BleWifiAp,
  type BleWifiStatus,
} from '../types/protocol'
import { encrypt, decrypt } from '../utils/bleCrypto'
import { buildPackets, reassemblePackets } from '../utils/blePacket'
import { parseBleName } from '../utils/dtuidParser'
import { Capacitor } from '@capacitor/core'

export interface ProvisionCallbacks {
  onLog?: (msg: string) => void
  onDisconnected?: () => void
}

/** 扫描到的附近蓝牙设备 */
export interface ProvisionScanDevice {
  deviceId: string
  name?: string
  rssi?: number
}

/** 是否支持在 App 内列出附近设备（原生 BLE 扫描）。Web 只能用系统选择器。 */
export const supportsDeviceListScan = (): boolean => Capacitor.isNativePlatform()

/** UI 依赖的公共接口（Web / 原生共享） */
export interface IBleProvisionManager {
  connect(dtuid?: string): Promise<void>
  disconnect(): Promise<void>
  getDuid(): string | null
  readonly deviceName: string | undefined
  /** 原生：扫描并回调附近 SSL_ 设备；Web：抛出（不支持列表扫描） */
  scanDevices(onFound: (d: ProvisionScanDevice) => void): Promise<void>
  stopScan(): Promise<void>
  /** 原生：连接指定 deviceId（来自 scanDevices）；Web：抛出 */
  connectTo(deviceId: string, name?: string): Promise<void>
  getVersion(): Promise<BleProvisionResponse<{ SV: string; HV: string }>>
  scanAp(): Promise<BleProvisionResponse<BleWifiAp[]>>
  configWifi(ssid: string, key: string): Promise<BleProvisionResponse>
  restart(): Promise<BleProvisionResponse>
  getWifiStatus(): Promise<BleProvisionResponse<BleWifiStatus>>
  confirmBleKey(bleKey: string): Promise<BleProvisionResponse>
  /** 直连模式：透传原始 Modbus 帧（十六进制字符串），走 UART 透传 CID（30024/30025） */
  uartPassthrough(reqHex: string, timeout?: number): Promise<BleProvisionResponse<{ Rsp: string }>>
}

// ─── 共享基类：编解码 / 分包 / 应答收集 / 便捷命令 ──────────────────────────────
abstract class BaseProvisionManager implements IBleProvisionManager {
  protected dtuid: string | null = null
  protected _deviceName: string | undefined

  private responseResolve: ((value: BleProvisionResponse) => void) | null = null
  private responseReject: ((reason: Error) => void) | null = null
  private receivedPackets: Uint8Array[] = []
  private responseTimeout: ReturnType<typeof setTimeout> | null = null

  protected cb: ProvisionCallbacks
  constructor(callbacks: ProvisionCallbacks = {}) { this.cb = callbacks }

  abstract connect(dtuid?: string): Promise<void>
  abstract disconnect(): Promise<void>
  /** 子类实现：写一个分包到 FED5 */
  protected abstract writePacket(bytes: Uint8Array): Promise<void>

  // 列表扫描默认不支持（Web）；原生子类覆盖
  async scanDevices(_onFound: (d: ProvisionScanDevice) => void): Promise<void> {
    throw new Error('Device-list scan is only available in the native app')
  }
  async stopScan(): Promise<void> { /* no-op on web */ }
  async connectTo(_deviceId: string, _name?: string): Promise<void> {
    throw new Error('connectTo is only available in the native app')
  }

  get deviceName(): string | undefined { return this._deviceName }
  getDuid(): string | null { return this.dtuid }

  /** 子类可重写：发送前确保 GATT 已连接（按需重连）。默认无操作。 */
  protected async ensureReady(): Promise<void> {}

  /** 发送命令并等待应答 */
  async sendCommand<T = BleProvisionResponse>(commandJson: object, dtuid?: string, timeout = 15000): Promise<T> {
    const key = dtuid || this.dtuid
    if (!key) throw new Error('BLE 未连接或 DTUID 未知')

    // GATT 可能在两次命令之间空闲断开（Web Bluetooth 常见）→ 发送前按需重连
    await this.ensureReady()

    this.log(`发送命令: ${JSON.stringify(commandJson)}`)
    const encrypted = encrypt(commandJson, key)
    const packets = buildPackets(encrypted)
    this.log(`分包 ${packets.length} 包，数据长度 ${encrypted.length}`)

    this.cleanupResponse()
    this.receivedPackets = []

    // 发送所有分包；若中途 GATT 断开，重连一次后整条命令重发
    try {
      await this.writeAllPackets(packets)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/disconnect|GATT|not connected/i.test(msg)) {
        this.log('写入时断开，重连后重发...')
        await this.ensureReady()
        this.receivedPackets = []
        await this.writeAllPackets(packets)
      } else {
        throw err
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.responseResolve = resolve as (v: BleProvisionResponse) => void
      this.responseReject = reject
      this.responseTimeout = setTimeout(() => {
        this.cleanupResponse()
        reject(new Error('等待设备应答超时'))
      }, timeout)
    })
  }

  private async writeAllPackets(packets: Uint8Array[]): Promise<void> {
    for (let i = 0; i < packets.length; i++) {
      this.log(`发送第 ${i + 1}/${packets.length} 包...`)
      await this.writePacket(packets[i])
      if (i < packets.length - 1) await this.sleep(50)
    }
  }

  /** 子类在收到 FED6 indication 分包时调用 */
  protected onIncoming(data: Uint8Array): void {
    if (data.length < 3) return
    const seqNo = data[0]
    const seqNum = data[1]
    const dataLen = data[2]
    this.log(`收到应答包 ${seqNo}/${seqNum}, 数据长度 ${dataLen}`)
    this.receivedPackets.push(data)

    if (seqNo >= seqNum) {
      const rawStr = reassemblePackets(this.receivedPackets)
      this.log(`应答数据合并完成，长度 ${rawStr.length}`)
      try {
        const response = decrypt<BleProvisionResponse>(rawStr, this.dtuid!)
        this.log(`应答: CID=${response.CID}, RC=${response.RC}`)
        this.clearResponseTimeout()
        const resolve = this.responseResolve
        this.cleanupResponse()
        resolve?.(response)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.log(`解密失败: ${msg}`)
        this.clearResponseTimeout()
        const reject = this.responseReject
        this.cleanupResponse()
        reject?.(new Error(`应答解密失败: ${msg}`))
      }
    }
  }

  // ── 便捷命令（CID 见配网规程）──
  getVersion()                       { return this.sendCommand<BleProvisionResponse<{ SV: string; HV: string }>>({ CID: 30001 }) }
  scanAp()                           { return this.sendCommand<BleProvisionResponse<BleWifiAp[]>>({ CID: 30003 }, undefined, 30000) }
  configWifi(ssid: string, key: string) { return this.sendCommand({ CID: 30005, PL: { SSID: ssid, Key: key } }) }
  restart()                          { return this.sendCommand({ CID: 30007 }) }
  getWifiStatus()                    { return this.sendCommand<BleProvisionResponse<BleWifiStatus>>({ CID: 30020 }) }
  confirmBleKey(bleKey: string)      { return this.sendCommand({ CID: 30050, PL: { BleKey: bleKey } }) }

  // 直连模式：把 modbusProtocol.ts 构造的 Modbus 帧（十六进制字符串）透传给设备 UART，
  // 串口参数固定 9600-8-None-1（见 modbusProtocol.ts 文档注释）。ParityBit 精确取值待
  // 真机验证 —— 若不匹配，失败表现为响应 CRC 校验不过，不会影响设备本身。
  uartPassthrough(reqHex: string, timeout = 8000) {
    return this.sendCommand<BleProvisionResponse<{ Rsp: string }>>(
      {
        CID: BLE_CID.GET_UART_ST_REQ,
        PL: { Req: reqHex, Uart: { BaudRate: 9600, DataBit: 8, ParityBit: 'None', StopBit: 1 } },
      },
      undefined, timeout,
    )
  }

  protected parseName(name: string | undefined): void {
    this._deviceName = name
    if (!name) return
    const parsed = parseBleName(name)
    if (parsed) {
      this.dtuid = parsed.dtuid
      this.log(`设备 DTUID: ${this.dtuid}, WiFi 状态: ${parsed.status}`)
    } else {
      this.log(`警告: 无法解析设备名称 "${name}"`)
    }
  }

  protected clearResponseTimeout(): void {
    if (this.responseTimeout) { clearTimeout(this.responseTimeout); this.responseTimeout = null }
  }
  protected cleanupResponse(): void {
    this.responseResolve = null
    this.responseReject = null
    this.receivedPackets = []
  }
  protected log(msg: string): void { this.cb.onLog?.(msg) }
  protected sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }
}

// ─── Web Bluetooth 后端 ───────────────────────────────────────────────────────
class WebBleProvisionManager extends BaseProvisionManager {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null
  private indicateChar: BluetoothRemoteGATTCharacteristic | null = null

  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge on Android/desktop.')
    }
    this.log('扫描蓝牙设备...')
    let device: BluetoothDevice
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'SSL_' }],
        optionalServices: [BLE_PROVISION_UUIDS.SERVICE],
      })
    } catch (prefixErr) {
      if ((prefixErr as Error).name === 'NotFoundError') {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [BLE_PROVISION_UUIDS.SERVICE],
        })
      } else { throw prefixErr }
    }
    this.device = device
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnect)

    this.log(`正在连接 ${this.device.name}...`)
    this.server = await this.device.gatt!.connect()
    const service = await this.server.getPrimaryService(BLE_PROVISION_UUIDS.SERVICE)
    this.writeChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.WRITE_TX)
    this.indicateChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.INDICATE_RX)
    await this.indicateChar.startNotifications()
    this.indicateChar.addEventListener('characteristicvaluechanged', this.handleIndication)
    this.parseName(this.device.name)
    this.log('GATT 连接成功')
  }

  /** 按需重连：GATT 空闲断开后重新连接并重新获取特征 / 订阅 */
  protected async ensureReady(): Promise<void> {
    if (!this.device?.gatt) throw new Error('BLE 未连接，请重新连接设备')
    if (this.device.gatt.connected && this.writeChar && this.indicateChar) return

    this.log('GATT 已断开，正在重连...')
    this.server = await this.device.gatt.connect()
    const service = await this.server.getPrimaryService(BLE_PROVISION_UUIDS.SERVICE)
    this.writeChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.WRITE_TX)
    this.indicateChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.INDICATE_RX)
    // 避免重复绑定监听
    this.indicateChar.removeEventListener('characteristicvaluechanged', this.handleIndication)
    await this.indicateChar.startNotifications()
    this.indicateChar.addEventListener('characteristicvaluechanged', this.handleIndication)
    this.log('GATT 重连成功')
  }

  protected async writePacket(bytes: Uint8Array): Promise<void> {
    await this.writeChar!.writeValueWithoutResponse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  }

  async disconnect(): Promise<void> {
    this.clearResponseTimeout()
    this.cleanupResponse()
    if (this.indicateChar) {
      try { await this.indicateChar.stopNotifications() } catch { /* ignore */ }
      this.indicateChar.removeEventListener('characteristicvaluechanged', this.handleIndication)
    }
    if (this.device) this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect)
    if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    this.device = null; this.server = null; this.writeChar = null; this.indicateChar = null; this.dtuid = null
    this.log('已断开连接')
  }

  private handleIndication = (event: Event): void => {
    const v = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (v) this.onIncoming(new Uint8Array(v.buffer))
  }
  private handleDisconnect = (): void => {
    this.log('设备已断开连接')
    this.cleanupResponse(); this.clearResponseTimeout()
    this.cb.onDisconnected?.()
  }
}

// ─── 原生 Capacitor BLE 后端 ──────────────────────────────────────────────────
class NativeBleProvisionManager extends BaseProvisionManager {
  private deviceId: string | null = null
  private connected = false

  private async ble() {
    const m = await import('@capacitor-community/bluetooth-le')
    return m.BleClient
  }

  async connect(): Promise<void> {
    const BleClient = await this.ble()
    await BleClient.initialize({ androidNeverForLocation: true })
    this.log('扫描蓝牙设备...')
    // 优先按 SSL_ 前缀过滤；前缀被改过/扫不到时回退到按服务 UUID 过滤
    let device
    try {
      device = await BleClient.requestDevice({
        namePrefix: 'SSL_',
        optionalServices: [BLE_PROVISION_UUIDS.SERVICE],
      })
    } catch (e) {
      this.log('SSL_ 前缀未匹配，改用服务 UUID 扫描...')
      device = await BleClient.requestDevice({
        services: [BLE_PROVISION_UUIDS.SERVICE],
      })
    }
    this.deviceId = device.deviceId
    this.log(`正在连接 ${device.name}...`)
    await this.openLink()
    this.parseName(device.name)
    this.log('GATT 连接成功')
  }

  /** 扫描附近 SSL_ 设备并回调（App 内列表）。约 10s 后自动停止。 */
  async scanDevices(onFound: (d: ProvisionScanDevice) => void): Promise<void> {
    const BleClient = await this.ble()
    await BleClient.initialize({ androidNeverForLocation: true })
    this.log('开始扫描附近设备...')
    await BleClient.requestLEScan(
      { namePrefix: 'SSL_', allowDuplicates: false },
      (result) => {
        if (!result?.device?.deviceId) return
        onFound({ deviceId: result.device.deviceId, name: result.device.name ?? result.localName, rssi: result.rssi })
      },
    )
  }

  async stopScan(): Promise<void> {
    try { const BleClient = await this.ble(); await BleClient.stopLEScan() } catch { /* ignore */ }
  }

  /** 连接扫描列表中选定的设备 */
  async connectTo(deviceId: string, name?: string): Promise<void> {
    await this.stopScan()
    this.deviceId = deviceId
    this.log(`正在连接 ${name ?? deviceId}...`)
    await this.openLink()
    this.parseName(name)
    this.log('GATT 连接成功')
  }

  /** 建立连接 + 订阅（连接与重连共用） */
  private async openLink(): Promise<void> {
    const BleClient = await this.ble()
    await BleClient.connect(this.deviceId!, () => {
      this.connected = false
      this.log('设备已断开连接')
      this.cleanupResponse(); this.clearResponseTimeout()
      this.cb.onDisconnected?.()
    })
    await BleClient.startNotifications(
      this.deviceId!, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.INDICATE_RX,
      (value) => this.onIncoming(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
    )
    this.connected = true
  }

  protected async ensureReady(): Promise<void> {
    if (this.connected || !this.deviceId) return
    this.log('GATT 已断开，正在重连...')
    await this.openLink()
    this.log('GATT 重连成功')
  }

  protected async writePacket(bytes: Uint8Array): Promise<void> {
    const BleClient = await this.ble()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    await BleClient.writeWithoutResponse(this.deviceId!, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.WRITE_TX, view)
  }

  async disconnect(): Promise<void> {
    this.clearResponseTimeout()
    this.cleanupResponse()
    if (this.deviceId) {
      try {
        const BleClient = await this.ble()
        try { await BleClient.stopNotifications(this.deviceId, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.INDICATE_RX) } catch { /* ignore */ }
        await BleClient.disconnect(this.deviceId)
      } catch { /* ignore */ }
    }
    this.deviceId = null; this.dtuid = null; this.connected = false
    this.log('已断开连接')
  }
}

// ─── 单例（按平台选择实现）───────────────────────────────────────────────────
let instance: IBleProvisionManager | null = null

export function getProvisionManager(callbacks?: ProvisionCallbacks): IBleProvisionManager {
  if (!instance) {
    instance = Capacitor.isNativePlatform()
      ? new NativeBleProvisionManager(callbacks)
      : new WebBleProvisionManager(callbacks)
  }
  return instance
}

export function destroyProvisionManager(): void {
  if (instance) {
    instance.stopScan().catch(() => { /* ignore */ })
    instance.disconnect().catch(err => console.error('[bleProvision] disconnect failed:', err))
    instance = null
  }
}

/** 仅停止扫描（若有活动实例），不创建新实例、不断开连接 */
export function stopProvisionScan(): void {
  instance?.stopScan().catch(() => { /* ignore */ })
}
