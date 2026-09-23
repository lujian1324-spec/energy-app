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
  scanDevices(onFound: (d: ProvisionScanDevice) => void, onSignal?: (rssi: number) => void): Promise<void>
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
  private expectedResponseCid: number | null = null
  private commandQueue: Promise<unknown> = Promise.resolve()
  private commandGeneration = 0
  private commandId = 0
  private connecting = false

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

  sendCommand<T = BleProvisionResponse>(commandJson: object, dtuid?: string, timeout = 15000): Promise<T> {
    const generation = this.commandGeneration
    const command = this.commandQueue.then(() => {
      if (generation !== this.commandGeneration) throw new Error('Bluetooth operation cancelled. Reconnect and try again.')
      return this.executeCommand<T>(commandJson, dtuid, timeout, generation)
    })
    this.commandQueue = command.catch(() => {})
    return command
  }

  protected async connectOnce(operation: () => Promise<void>): Promise<void> {
    if (this.connecting) throw new Error('A Bluetooth connection is already in progress.')
    this.connecting = true
    this.cancelCommands('Bluetooth device changed. Please retry the operation.')
    try { await operation() } finally { this.connecting = false }
  }

  protected cancelCommands(message: string): void {
    this.commandGeneration++
    const reject = this.responseReject
    this.clearResponseTimeout()
    this.cleanupResponse()
    reject?.(new Error(message))
  }

  private async executeCommand<T>(commandJson: object, dtuid: string | undefined, timeout: number, generation: number): Promise<T> {
    if (this.connecting) throw new Error('Bluetooth connection is still in progress. Please wait.')
    const commandId = ++this.commandId
    const key = dtuid || this.dtuid
    if (!key) throw new Error('Bluetooth is not connected or the device ID is unknown.')

    await this.ensureReady()
    if (generation !== this.commandGeneration) throw new Error('Bluetooth operation cancelled. Reconnect and try again.')

    const cid = (commandJson as { CID: number }).CID
    this.log(`Sending command: CID=${cid}`)
    const encrypted = encrypt(commandJson, key)
    const packets = buildPackets(encrypted, this.getMaxDataPerPacket())
    this.log(`Split into ${packets.length} packets, payload ${encrypted.length}, max ${this.getMaxDataPerPacket()} per packet`)

    this.cleanupResponse()
    this.resetPackets()
    this.expectedResponseCid = cid + 1

    const pending = new Promise<T>((resolve, reject) => {
      this.responseResolve = resolve as (v: BleProvisionResponse) => void
      this.responseReject = reject
      this.responseTimeout = setTimeout(() => {
        this.cancelCommands('Timed out waiting for the device. Reconnect and try again.')
        void this.disconnect().catch(() => {})
      }, timeout)
    })

    // Observe both promises immediately: a disconnect must settle the command
    // even while the native write callback is still pending.
    const sending = this.writeAllPackets(packets, generation, commandId).catch(err => {
      if (generation === this.commandGeneration && commandId === this.commandId && this.responseReject) {
        this.cancelCommands(err instanceof Error ? err.message : String(err))
      }
    })
    try {
      return await Promise.race([pending, sending.then(() => pending)])
    } finally {
      this.clearResponseTimeout()
      this.cleanupResponse()
    }
  }

  private async writeAllPackets(packets: Uint8Array[], generation: number, commandId: number): Promise<void> {
    for (let i = 0; i < packets.length; i++) {
      if (generation !== this.commandGeneration || commandId !== this.commandId) throw new Error('Bluetooth operation cancelled.')
      if (!this.responseResolve) return
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
    if (seqNo < 1 || seqNum < 1 || seqNo > seqNum || dataLen !== pkt.length - BLE_PACKET_HEADER_SIZE) return
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
      if (response.CID !== this.expectedResponseCid) {
        this.log(`Ignoring unrelated response CID=${response.CID}`)
        this.resetPackets()
        return
      }
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
    this.expectedResponseCid = null
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
    return this.connectOnce(() => this.selectAndConnect())
  }

  private async selectAndConnect(): Promise<void> {
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
    this.cancelCommands('Bluetooth disconnected. Reconnect the device and try again.')
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
    this.cancelCommands('Bluetooth disconnected. Reconnect the device and try again.')
    this.cb.onDisconnected?.()
  }
}

type ScanAdvertisement = {
  device?: { name?: string }
  localName?: string
  uuids?: string[]
  rawAdvertisement?: DataView
}

/** Prefer a complete ID, including the scan-response/raw name, over a cached name. */
export function provisionScanName(r: ScanAdvertisement): string | undefined {
  const names = [r.localName, parseRawAdvertisement(r.rawAdvertisement).name, r.device?.name]
    .map(n => n?.replace(/\0/g, '').trim()).filter((n): n is string => !!n)
  return names.find(n => parseBleName(n)) ?? names.find(looksLikeSierroName) ?? names[0]
}

export function isSierroScanResult(r: ScanAdvertisement): boolean {
  if (looksLikeSierroName(provisionScanName(r) ?? '')) return true
  const uuids = [...(r.uuids ?? []), ...parseRawAdvertisement(r.rawAdvertisement).uuids]
  return uuids.some(u => /^(?:fee7|0000fee7|0000fee7-0000-1000-8000-00805f9b34fb)$/i.test(u))
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
      for (let j = 0; j + 16 <= data.length; j += 16) {
        const hex = Array.from(data.subarray(j, j + 16)).reverse()
          .map(x => x.toString(16).padStart(2, '0')).join('')
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
  private scanGeneration = 0
  private linkGeneration = 0
  private scanCounts = { advertisements: 0, matched: new Set<string>() }

  private async ble() {
    const m = await import('@capacitor-community/bluetooth-le')
    return m.BleClient
  }

  private async ensureBlePermission(_BleClient: any): Promise<void> {
    // No-op by design — see doc comment above.
  }

  async connect(): Promise<void> {
    return this.connectOnce(() => this.selectAndConnect())
  }

  private async selectAndConnect(): Promise<void> {
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
    await this.connectSelected(device.deviceId, device.name)
  }

  async scanDevices(onFound: (d: ProvisionScanDevice) => void, onSignal?: (rssi: number) => void): Promise<void> {
    const generation = ++this.scanGeneration
    const BleClient = await this.ble()
    const platform = Capacitor.getPlatform()
    const androidVersion = androidMajorVersion()
    this.scanCounts = { advertisements: 0, matched: new Set<string>() }
    this.log(`[ble-scan] ${JSON.stringify({ event: 'initialize', platform, androidVersion, androidNeverForLocation: true, permission: 'requesting' })}`)
    try {
      await BleClient.initialize({ androidNeverForLocation: true })
    } catch (err) {
      this.log('[ble-scan] {"event":"initialize_failed","permission":"not_granted_or_unavailable"}')
      throw err
    }
    this.log('[ble-scan] {"event":"initialized","permission":"granted"}')
    if (generation !== this.scanGeneration) return
    if (platform === 'android') {
      let locationOn: boolean | null = null
      try { locationOn = await BleClient.isLocationEnabled() } catch { /* report unknown */ }
      const required = androidVersion !== null && androidVersion <= 11
      this.log(`[ble-scan] ${JSON.stringify({ event: 'location', enabled: locationOn, required })}`)
      if (required && locationOn === false) {
        throw new Error('Location services are off. Turn on Location in Android Settings, then search again.')
      }
    }
    if (generation !== this.scanGeneration) return
    // Already broad: no OS name/UUID filter. Android must deliver later scan
    // responses too; the plugin otherwise deduplicates before our name filter.
    this.log('[ble-scan] {"event":"start","filterUUIDs":[],"allowDuplicates":true}')
    await BleClient.requestLEScan(
      { allowDuplicates: true },
      (result) => {
        if (generation !== this.scanGeneration) return
        this.scanCounts.advertisements++
        // Unidentified advertisements can still provide a weak-signal retry hint.
        // Ignore missing/invalid RSSI and the positive "unavailable" sentinel.
        if (typeof result.rssi === 'number' && Number.isFinite(result.rssi) && result.rssi < 0 && result.rssi >= -127) {
          onSignal?.(result.rssi)
        }
        if (!result?.device?.deviceId || !isSierroScanResult(result)) return
        this.scanCounts.matched.add(result.device.deviceId)
        onFound({ deviceId: result.device.deviceId, name: provisionScanName(result), rssi: result.rssi })
      },
    )
  }

  async stopScan(): Promise<void> {
    ++this.scanGeneration
    this.log(`[ble-scan] ${JSON.stringify({ event: 'stop', advertisements: this.scanCounts.advertisements, resultCount: this.scanCounts.matched.size })}`)
    try { const BleClient = await this.ble(); await BleClient.stopLEScan() } catch { /* ignore */ }
  }

  async connectTo(deviceId: string, name?: string): Promise<void> {
    return this.connectOnce(() => this.connectSelected(deviceId, name))
  }

  private async connectSelected(deviceId: string, name?: string): Promise<void> {
    const generation = ++this.linkGeneration
    await this.stopScan()
    if (generation !== this.linkGeneration) throw new Error('Bluetooth connection cancelled.')
    if (this.deviceId && this.deviceId !== deviceId) {
      const BleClient = await this.ble()
      await BleClient.disconnect(this.deviceId)
    }
    if (generation !== this.linkGeneration) throw new Error('Bluetooth connection cancelled.')
    this.connected = false
    this.dtuid = null
    this._deviceName = undefined
    this.deviceId = deviceId
    this.log(`Connecting ${name ?? deviceId}...`)
    await this.openLink()
    if (generation !== this.linkGeneration) throw new Error('Bluetooth connection cancelled.')
    this.parseName(name)
    await this.resolveDtuidViaGap()
    if (generation !== this.linkGeneration) throw new Error('Bluetooth connection cancelled.')
    this.log('GATT connected')
  }

  private async resolveDtuidViaGap(): Promise<void> {
    if (this.dtuid || !this.deviceId) return
    const deviceId = this.deviceId
    const generation = this.linkGeneration
    const GENERIC_ACCESS = '00001800-0000-1000-8000-00805f9b34fb'
    const DEVICE_NAME = '00002a00-0000-1000-8000-00805f9b34fb'
    try {
      const BleClient = await this.ble()
      const v = await BleClient.read(deviceId, GENERIC_ACCESS, DEVICE_NAME)
      if (generation !== this.linkGeneration || deviceId !== this.deviceId) return
      const name = new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).replace(/\0+$/, '')
      if (name) { this.log(`GAP device name: ${name}`); this.parseName(name) }
    } catch (e) {
      this.log(`GAP device name read failed (ignored): ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private async openLink(): Promise<void> {
    const deviceId = this.deviceId
    const generation = this.linkGeneration
    if (!deviceId) throw new Error('Bluetooth is not connected. Reconnect the device.')
    const assertCurrent = () => {
      if (generation !== this.linkGeneration || deviceId !== this.deviceId) throw new Error('Bluetooth connection cancelled.')
    }
    const BleClient = await this.ble()
    assertCurrent()
    await BleClient.connect(deviceId, () => {
      if (generation !== this.linkGeneration || deviceId !== this.deviceId) return
      ++this.linkGeneration
      this.connected = false
      this.log('Device disconnected')
      this.cancelCommands('Bluetooth disconnected. Reconnect the device and try again.')
      this.cb.onDisconnected?.()
    })
    try {
      assertCurrent()
      await this.waitForProvisionGatt(BleClient, deviceId, assertCurrent)
      let lastErr: unknown
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          assertCurrent()
          await BleClient.startNotifications(
            deviceId, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.INDICATE_RX,
            (value) => {
              if (generation !== this.linkGeneration || deviceId !== this.deviceId) return
              const src = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
              const copy = new Uint8Array(src.byteLength)
              copy.set(src)
              this.onIncoming(copy)
            },
          )
          lastErr = null
          break
        } catch (e) {
          assertCurrent()
          lastErr = e
          this.log(`startNotifications attempt ${attempt} failed: ${e instanceof Error ? e.message : String(e)}`)
          try { await BleClient.discoverServices(deviceId) } catch { /* ignore */ }
          await this.sleep(400 * attempt)
        }
      }
      if (lastErr) throw lastErr
      assertCurrent()
      this.connected = true
      if (Capacitor.getPlatform() === 'ios') {
        await this.sleep(300)
        assertCurrent()
      }
    } catch (err) {
      if (generation === this.linkGeneration) this.connected = false
      try { await BleClient.disconnect(deviceId) } catch { /* preserve the connection error */ }
      throw err
    }
  }

  private async waitForProvisionGatt(BleClient: { getServices: (id: string) => Promise<Array<{ uuid: string }>>; discoverServices: (id: string) => Promise<unknown>; getMtu: (id: string) => Promise<number> }, deviceId: string, assertCurrent: () => void): Promise<void> {
    const want = BLE_PROVISION_UUIDS.SERVICE.toLowerCase()
    const deadline = Date.now() + 5000
    let found = false
    while (Date.now() < deadline) {
      assertCurrent()
      try {
        const services = await BleClient.getServices(deviceId)
        if (services.some(s => (s.uuid || '').toLowerCase() === want || (s.uuid || '').toLowerCase().includes('fee7'))) {
          found = true
          break
        }
      } catch { /* services not ready yet */ }
      try { await BleClient.discoverServices(deviceId) } catch { /* ignore */ }
      await this.sleep(250)
    }
    if (!found) this.log('FEE7 not yet in GATT service list; retrying notifications')
    const ver = Capacitor.getPlatform() === 'android' ? androidMajorVersion() : null
    if (ver === 12) await this.sleep(600)
    let mtu = 23
    try {
      const n = await BleClient.getMtu(deviceId)
      if (typeof n === 'number' && n > 0) mtu = n
    } catch { /* ignore */ }
    if (mtu < 50) {
      await this.sleep(300)
      try {
        const n = await BleClient.getMtu(deviceId)
        if (typeof n === 'number' && n > 0) mtu = n
      } catch { /* ignore */ }
    }
    assertCurrent()
    this.maxDataPerPacket = Math.max(1, Math.min(237, mtu - 6))
    this.log(`GATT ready MTU=${mtu}, payload per packet=${this.maxDataPerPacket}`)
  }

  protected getMaxDataPerPacket(): number { return this.maxDataPerPacket }

  protected async ensureReady(): Promise<void> {
    if (!this.deviceId) throw new Error('Bluetooth is not connected. Reconnect the device.')
    if (this.connected) return
    this.log('GATT disconnected, reconnecting...')
    await this.openLink()
    this.log('GATT reconnected')
  }

  protected async writePacket(bytes: Uint8Array): Promise<void> {
    const deviceId = this.deviceId
    const generation = this.linkGeneration
    if (!deviceId) throw new Error('Bluetooth is not connected.')
    const BleClient = await this.ble()
    if (generation !== this.linkGeneration) throw new Error('Bluetooth disconnected.')
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const view = new DataView(copy.buffer)
    if (Capacitor.getPlatform() === 'ios') {
      await BleClient.write(deviceId, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.WRITE_TX, view)
      return
    }
    try {
      await BleClient.writeWithoutResponse(deviceId, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.WRITE_TX, view)
    } catch (e) {
      if (generation !== this.linkGeneration) throw e
      this.log(`writeWithoutResponse failed, falling back to write: ${e instanceof Error ? e.message : String(e)}`)
      await BleClient.write(deviceId, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.WRITE_TX, view)
    }
  }

  async disconnect(): Promise<void> {
    ++this.linkGeneration
    this.cancelCommands('Bluetooth disconnected. Reconnect the device and try again.')
    const deviceId = this.deviceId
    this.deviceId = null; this.dtuid = null; this.connected = false; this.maxDataPerPacket = 237
    if (deviceId) {
      try {
        const BleClient = await this.ble()
        try { await BleClient.stopNotifications(deviceId, BLE_PROVISION_UUIDS.SERVICE, BLE_PROVISION_UUIDS.INDICATE_RX) } catch { /* ignore */ }
        await BleClient.disconnect(deviceId)
      } catch { /* ignore */ }
    }
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

export async function destroyProvisionManager(): Promise<void> {
  if (instance) {
    const previous = instance
    instance = null
    await previous.stopScan()
    await previous.disconnect().catch(err => console.error('[bleProvision] disconnect failed:', err))
  }
}

export function stopProvisionScan(): void {
  instance?.stopScan().catch(() => { /* ignore */ })
}
