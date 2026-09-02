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
  BLE_PACKET_HEADER_SIZE,
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

abstract class BaseProvisionManager implements IBleProvisionManager {
  protected dtuid: string | null = null
  protected _deviceName: string | undefined

  private responseResolve: ((value: BleProvisionResponse) => void) | null = null
  private responseReject: ((reason: Error) => void) | null = null
  private receivedPackets: Map<number, Uint8Array> = new Map()
  private responseTimeout: ReturnType<typeof setTimeout> | null = null

  protected cb: ProvisionCallbacks
  constructor(callbacks: ProvisionCallbacks = {}) { this.cb = callbacks }

  abstract connect(dtuid?: string): Promise<void>
  abstract disconnect(): Promise<void>
  protected abstract writePacket(bytes: Uint8Array): Promise<void>

  async scanDevices(_onFound: (d: ProvisionScanDevice) => void): Promise<void> {
    throw new Error('Device-list scan is only available in the native app')
  }
  async stopScan(): Promise<void> { /* no-op on web */ }
  async connectTo(_deviceId: string, _name?: string): Promise<void> {
    throw new Error('connectTo is only available in the native app')
  }

  get deviceName(): string | undefined { return this._deviceName }
  getDuid(): string | null { return this.dtuid }

  protected async ensureReady(): Promise<void> {}
  protected getMaxDataPerPacket(): number { return 237 }

  async sendCommand<T = BleProvisionResponse>(commandJson: object, dtuid?: string, timeout = 15000): Promise<T> {
    const key = dtuid || this.dtuid
    if (!key) throw new Error('Bluetooth is not connected or the device ID is unknown.')

    await this.ensureReady()

    this.log(`Sending command: ${JSON.stringify(commandJson)}`)
    const encrypted = encrypt(commandJson, key)
    const packets = buildPackets(encrypted, this.getMaxDataPerPacket())
    this.log(`Split into ${packets.length} packets, payload ${encrypted.length}, max ${this.getMaxDataPerPacket()} per packet`)

    this.cleanupResponse()
    this.resetPackets()

    const pending = new Promise<T>((resolve, reject) => {
      this.responseResolve = resolve as (v: BleProvisionResponse) => void
      this.responseReject = reject
      this.responseTimeout = setTimeout(() => {
        this.cleanupResponse()
        reject(new Error('Timed out waiting for the device.'))
      }, timeout)
    })

    try {
      await this.writeAllPackets(packets)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/disconnect|GATT|not connected/i.test(msg)) {
        this.log('Disconnected while writing; reconnecting and resending...')
        try {
          await this.ensureReady()
          this.resetPackets()
          await this.writeAllPackets(packets)
        } catch (err2) {
          this.clearResponseTimeout()
          this.cleanupResponse()
          throw err2
        }
      } else {
        this.clearResponseTimeout()
        this.cleanupResponse()
        throw err
      }
    }

    return pending
  }

  private async writeAllPackets(packets: Uint8Array[]): Promise<void> {
    for (let i = 0; i < packets.length; i++) {
      this.log(`Sending packet ${i + 1}/${packets.length}...`)
      await this.writePacket(packets[i])
      if (i < packets.length - 1) await this.sleep(50)
    }
  }

  protected onIncoming(data: Uint8Array): void {
    if (data.length < BLE_PACKET_HEADER_SIZE) return
    const pkt = new Uint8Array(data.byteLength)
    pkt.set(data)
    if (!this.responseResolve) return
    const seqNo = pkt[0]
    const seqNum = pkt[1]
    const dataLen = pkt[2]
    this.log(`Received response packet ${seqNo}/${seqNum}, data length ${dataLen}`)
    this.receivedPackets.set(seqNo, pkt)

    let ordered: Uint8Array[]
    if (seqNum <= 1) {
      ordered = [pkt]
    } else {
      if (this.receivedPackets.size < seqNum) return
      ordered = []
      for (let i = 1; i <= seqNum; i++) {
        const p = this.receivedPackets.get(i)
        if (!p) return
        ordered.push(p)
      }
    }

    const rawStr = reassemblePackets(ordered)
    this.log(`Reassembled ${ordered.length} packets, length ${rawStr.length}`)
    try {
      const response = decrypt<BleProvisionResponse>(rawStr, this.dtuid!)
      this.log(`Response: CID=${response.CID}, RC=${response.RC}`)
      this.clearResponseTimeout()
      const resolve = this.responseResolve
      this.cleanupResponse()
      resolve?.(response)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.log(`Decrypt failed: ${msg}`)
      this.clearResponseTimeout()
      const reject = this.responseReject
      this.cleanupResponse()
      reject?.(new Error(`Failed to decrypt the device response: ${msg}`))
    }
  }

  getVersion()                       { return this.sendCommand<BleProvisionResponse<{ SV: string; HV: string }>>({ CID: 30001 }) }
  scanAp()                           { return this.sendCommand<BleProvisionResponse<BleWifiAp[]>>({ CID: 30003 }, undefined, 30000) }
  configWifi(ssid: string, key: string) { return this.sendCommand({ CID: 30005, PL: { SSID: ssid, Key: key } }) }
  restart()                          { return this.sendCommand({ CID: 30007 }) }
  getWifiStatus()                    { return this.sendCommand<BleProvisionResponse<BleWifiStatus>>({ CID: 30020 }) }
  confirmBleKey(bleKey: string)      { return this.sendCommand({ CID: 30050, PL: { BleKey: bleKey } }) }

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
      this.log(`Device DTUID: ${this.dtuid}, Wi-Fi status: ${parsed.status}`)
    } else {
      this.log(`Warning: cannot parse device name "${name}"`)
    }
  }

  protected clearResponseTimeout(): void {
    if (this.responseTimeout) { clearTimeout(this.responseTimeout); this.responseTimeout = null }
  }
  protected cleanupResponse(): void {
    this.responseResolve = null
    this.responseReject = null
    this.resetPackets()
  }
  private resetPackets(): void {
    this.receivedPackets.clear()
  }
  protected log(msg: string): void { this.cb.onLog?.(msg) }
  protected sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }
}

class WebBleProvisionManager extends BaseProvisionManager {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null
  private indicateChar: BluetoothRemoteGATTCharacteristic | null = null

  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge on Android/desktop.')
    }
    this.log('Scanning for Bluetooth devices...')
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

    this.log(`Connecting ${this.device.name}...`)
    this.server = await this.device.gatt!.connect()
    const service = await this.server.getPrimaryService(BLE_PROVISION_UUIDS.SERVICE)
    this.writeChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.WRITE_TX)
    this.indicateChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.INDICATE_RX)
    await this.indicateChar.startNotifications()
    this.indicateChar.addEventListener('characteristicvaluechanged', this.handleIndication)
    this.parseName(this.device.name)
    this.log('GATT connected')
  }

  protected async ensureReady(): Promise<void> {
    if (!this.device?.gatt) throw new Error('Bluetooth is not connected. Reconnect the device.')
    if (this.device.gatt.connected && this.writeChar && this.indicateChar) return

    this.log('GATT disconnected, reconnecting...')
    this.server = await this.device.gatt.connect()
    const service = await this.server.getPrimaryService(BLE_PROVISION_UUIDS.SERVICE)
    this.writeChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.WRITE_TX)
    this.indicateChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.INDICATE_RX)
    this.indicateChar.removeEventListener('characteristicvaluechanged', this.handleIndication)
    await this.indicateChar.startNotifications()
    this.indicateChar.addEventListener('characteristicvaluechanged', this.handleIndication)
    this.log('GATT reconnected')
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
    this.log('Disconnected')
  }

  private handleIndication = (event: Event): void => {
    const v = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (v) this.onIncoming(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
  }
  private handleDisconnect = (): void => {
    this.log('Device disconnected')
    this.cleanupResponse(); this.clearResponseTimeout()
    this.cb.onDisconnected?.()
  }
}

export function isSierroScanResult(r: {
  device?: { name?: string }
  localName?: string
  uuids?: string[]
  rawAdvertisement?: DataView
}): boolean {
  const fromRaw = parseRawAdvertisement(r.rawAdvertisement)
  const name = (r.device?.name ?? r.localName ?? fromRaw.name ?? '').trim()
  if (looksLikeSierroName(name)) return true
  const uuids = [...(r.uuids ?? []), ...fromRaw.uuids]
  return uuids.some(u => u.toLowerCase().includes('fee7'))
}

function looksLikeSierroName(name: string): boolean {
  if (!name) return false
  if (name.toUpperCase().startsWith('SSL_')) return true
  return parseBleName(name) != null
}

export function parseRawAdvertisement(raw?: DataView): { name: string; uuids: string[] } {
  if (!raw || raw.byteLength < 2) return { name: '', uuids: [] }
  const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
  let i = 0
  let name = ''
  const uuids: string[] = []
  while (i < bytes.length) {
    const len = bytes[i]
    if (len === 0) break
    if (i + len >= bytes.length) break
    const type = bytes[i + 1]
    const data = bytes.subarray(i + 2, i + 1 + len)
    if (type === 0x08 || type === 0x09) {
      try { name = new TextDecoder().decode(data) } catch { /* ignore */ }
    } else if (type === 0x02 || type === 0x03) {
      for (let j = 0; j + 1 < data.length; j += 2) {
        const uuid16 = data[j] | (data[j + 1] << 8)
        uuids.push(uuid16.toString(16).padStart(4, '0'))
      }
    } else if (type === 0x06 || type === 0x07) {
      if (data.length >= 16) {
        const b = Array.from(data.subarray(0, 16))
        const le = [...b.slice(0, 4).reverse(), ...b.slice(4, 6).reverse(), ...b.slice(6, 8).reverse(), ...b.slice(8)]
        const hex = le.map(x => x.toString(16).padStart(2, '0')).join('')
        uuids.push(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`)
      }
    }
    i += len + 1
  }
  return { name, uuids }
}

export function androidMajorVersion(): number | null {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const m = /Android (\d+)/.exec(ua || '')
  return m ? parseInt(m[1], 10) : null
}

class NativeBleProvisionManager extends BaseProvisionManager {
  private deviceId: string | null = null
  private connected = false
  private maxDataPerPacket = 237

  private async ble() {
    const m = await import('@capacitor-community/bluetooth-le')
    return m.BleClient
  }

  private async ensureBlePermission(_BleClient: any): Promise<void> {
    // No-op by design — see doc comment above.
  }

  async connect(): Promise<void> {
    const BleClient = await this.ble()
    await BleClient.initialize({ androidNeverForLocation: true })
    await this.ensureBlePermission(BleClient)
    this.log('Scanning for Bluetooth devices...')
    let device
    try {
      device = await BleClient.requestDevice({
        namePrefix: 'SSL_',
        optionalServices: [BLE_PROVISION_UUIDS.SERVICE],
      })
    } catch (e) {
      this.log('SSL_ prefix did not match; scanning by service UUID...')
      device = await BleClient.requestDevice({
        services: [BLE_PROVISION_UUIDS.SERVICE],
      })
    }
    this.deviceId = device.deviceId
    this.log(`Connecting ${device.name}...`)
    await this.openLink()
    this.parseName(device.name)
    await this.resolveDtuidViaGap()
    this.log('GATT connected')
  }

  async scanDevices(onFound: (d: ProvisionScanDevice) => void): Promise<void> {
    const BleClient = await this.ble()
    await BleClient.initialize({ androidNeverForLocation: true })
    await this.ensureBlePermission(BleClient)
    if (Capacitor.getPlatform() === 'android' && androidMajorVersion() !== null && androidMajorVersion()! <= 11) {
      let locationOn = true
      try { locationOn = await BleClient.isLocationEnabled() }
      catch { /* ignore */ }
      if (!locationOn) throw new Error('Location services are off — enable location to scan for Bluetooth devices.')
    }
    this.log('Scanning for nearby devices...')
    const ios = Capacitor.getPlatform() === 'ios'
    await BleClient.requestLEScan(
      { allowDuplicates: ios },
      (result) => {
        if (!result?.device?.deviceId) return
        if (!isSierroScanResult(result)) return
        onFound({
          deviceId: result.device.deviceId,
          name: result.device.name ?? result.localName,
          rssi: result.rssi,
        })
      },
    )
  }

  async stopScan(): Promise<void> {
    try { const BleClient = await this.ble(); await BleClient.stopLEScan() } catch { /* ignore */ }
  }

  async connectTo(deviceId: string, name?: string): Promise<void> {
    await this.stopScan()
    this.deviceId = deviceId
    this.log(`Connecting ${name ?? deviceId}...`)
    await this.openLink()
    this.parseName(name)
    await this.resolveDtuidViaGap()
    this.log('GATT connected')
  }

  private async resolveDtuidViaGap(): Promise<void> {
    if (this.dtuid || !this.deviceId) return
    const GENERIC_ACCESS = '00001800-0000-1000-8000-00805f9b34fb'
    const DEVICE_NAME = '00002a00-0000-1000-8000-00805f9b34fb'
    try {
      const BleClient = await this.ble()
      const v = await BleClient.read(this.deviceId, GENERIC_ACCESS, DEVICE_NAME)
      const name = new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).replace(/\0+$/, '')
      if (name) { this.log(`GAP device name: ${name}`); this.parseName(name) }
    } catch (e) {
      this.log(`GAP device name read failed (ignored): ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private async openLink(): Promise<void> {
    const BleClient = await this.ble()
    await BleClient.connect(this.deviceId!, () => {
      this.connected = false
      this.log('Device disconnected')
      this.cleanupResponse(); this.clearResponseTimeout()
      this.cb.onDisconnected?.()
    })
    await this.waitForProvisionGatt(BleClient)
    let lastErr: unknown
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await BleClient.startNotifications(
          this.deviceId!, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.INDICATE_RX,
          (value) => {
            const src = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            const copy = new Uint8Array(src.byteLength)
            copy.set(src)
            this.onIncoming(copy)
          },
        )
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        this.log(`startNotifications attempt ${attempt} failed: ${e instanceof Error ? e.message : String(e)}`)
        try { await BleClient.discoverServices(this.deviceId!) } catch { /* ignore */ }
        await this.sleep(400 * attempt)
      }
    }
    if (lastErr) throw lastErr
    this.connected = true
    if (Capacitor.getPlatform() === 'ios') await this.sleep(300)
  }

  private async waitForProvisionGatt(BleClient: { getServices: (id: string) => Promise<Array<{ uuid: string }>>; discoverServices: (id: string) => Promise<unknown>; getMtu: (id: string) => Promise<number> }): Promise<void> {
    const want = BLE_PROVISION_UUIDS.SERVICE.toLowerCase()
    const deadline = Date.now() + 5000
    let found = false
    while (Date.now() < deadline) {
      try {
        const services = await BleClient.getServices(this.deviceId!)
        if (services.some(s => (s.uuid || '').toLowerCase() === want || (s.uuid || '').toLowerCase().includes('fee7'))) {
          found = true
          break
        }
      } catch { /* services not ready yet */ }
      try { await BleClient.discoverServices(this.deviceId!) } catch { /* ignore */ }
      await this.sleep(250)
    }
    if (!found) this.log('FEE7 not yet in GATT service list; retrying notifications')
    const ver = Capacitor.getPlatform() === 'android' ? androidMajorVersion() : null
    if (ver === 12) await this.sleep(600)
    let mtu = 23
    try {
      const n = await BleClient.getMtu(this.deviceId!)
      if (typeof n === 'number' && n > 0) mtu = n
    } catch { /* ignore */ }
    if (mtu < 50) {
      await this.sleep(300)
      try {
        const n = await BleClient.getMtu(this.deviceId!)
        if (typeof n === 'number' && n > 0) mtu = n
      } catch { /* ignore */ }
    }
    this.maxDataPerPacket = Math.max(20, Math.min(237, mtu - 6))
    this.log(`GATT ready MTU=${mtu}, payload per packet=${this.maxDataPerPacket}`)
  }

  protected getMaxDataPerPacket(): number { return this.maxDataPerPacket }

  protected async ensureReady(): Promise<void> {
    if (this.connected || !this.deviceId) return
    this.log('GATT disconnected, reconnecting...')
    await this.openLink()
    this.log('GATT reconnected')
  }

  protected async writePacket(bytes: Uint8Array): Promise<void> {
    const BleClient = await this.ble()
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const view = new DataView(copy.buffer)
    if (Capacitor.getPlatform() === 'ios') {
      await BleClient.write(this.deviceId!, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.WRITE_TX, view)
      return
    }
    try {
      await BleClient.writeWithoutResponse(this.deviceId!, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.WRITE_TX, view)
    } catch (e) {
      this.log(`writeWithoutResponse failed, falling back to write: ${e instanceof Error ? e.message : String(e)}`)
      await BleClient.write(this.deviceId!, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.WRITE_TX, view)
    }
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
    this.deviceId = null; this.dtuid = null; this.connected = false; this.maxDataPerPacket = 237
    this.log('Disconnected')
  }
}

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

export function stopProvisionScan(): void {
  instance?.stopScan().catch(() => { /* ignore */ })
}
