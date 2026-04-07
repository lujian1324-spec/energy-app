/**
 * Web Bluetooth API 通讯层
 * 实现与 Sierro 1000 储能站的 BLE GATT 通信
 *
 * 支持：
 * - 设备扫描 & 配对
 * - 读取电量、功率、温度、端口状态
 * - Notifications（服务端主动推送）
 * - 写入运行模式、充电限额、端口开关
 * - 断线重连
 */

import {
  BLE_UUIDS,
  type ConnectionInfo,
  type BlePowerPacket,
  type ProtocolType,
} from '../types/protocol'
import { logConnection, logCommand, addAlert } from '../db/powerflowDB'

// ----------------------------------------------------------------
// 类型（补全 Web Bluetooth API 缺失的 TS 类型）
// ----------------------------------------------------------------
type BluetoothRemoteGATTCharacteristic_ = BluetoothRemoteGATTCharacteristic
type BluetoothRemoteGATTServer_ = BluetoothRemoteGATTServer

// ----------------------------------------------------------------
// 运行模式编码
// ----------------------------------------------------------------
const MODE_ENCODE: Record<string, number> = {
  solar: 0, backup: 1, car: 2, outdoor: 3,
}
const MODE_DECODE: Record<number, string> = {
  0: 'solar', 1: 'backup', 2: 'car', 3: 'outdoor',
}

// ----------------------------------------------------------------
// 事件回调类型
// ----------------------------------------------------------------
export interface BleCallbacks {
  onStatusChange: (info: ConnectionInfo) => void
  onPowerData: (packet: BlePowerPacket) => void
  onBatteryLevel: (level: number) => void
  onPortStatus: (bitmap: number) => void
  onModeChange: (mode: string) => void
}

// ----------------------------------------------------------------
// BleManager 类
// ----------------------------------------------------------------
export class BleManager {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer_ | null = null
  private chars: Partial<Record<string, BluetoothRemoteGATTCharacteristic_>> = {}
  private cb: BleCallbacks
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private readonly MAX_RECONNECT = 5

  constructor(callbacks: BleCallbacks) {
 this.cb = callbacks
  }

  // ---- 公开 API ------------------------------------------------

  /** 检查浏览器是否支持 Web Bluetooth */
  static isSupported(): boolean {
 return typeof navigator !== 'undefined' &&
 'bluetooth' in navigator
  }

  /** 扫描并连接设备 */
  async connect(): Promise<void> {
 if (!BleManager.isSupported()) {
 this._emitStatus({ protocol: 'bluetooth', status: 'error', errorMessage: '当前浏览器不支持 Web Bluetooth（请使用 Chrome 或 Edge）' })
 return
 }

 this._emitStatus({ protocol: 'bluetooth', status: 'scanning' })

 try {
 this.device = await navigator.bluetooth.requestDevice({
 filters: [
 { namePrefix: 'Sierro' },
 { services: [BLE_UUIDS.POWER_SERVICE] },
 ],
 optionalServices: [
 BLE_UUIDS.POWER_SERVICE,
 BLE_UUIDS.DEVICE_INFO_SERVICE,
 ],
 })

 this.device.addEventListener('gattserverdisconnected', this._onDisconnected)
 await this._connectGATT()
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err)
 // 用户取消扫描不记录为错误
 if (msg.includes('User cancelled')) {
 this._emitStatus({ protocol: 'bluetooth', status: 'disconnected' })
 return
 }
 this._emitStatus({ protocol: 'bluetooth', status: 'error', errorMessage: msg })
 void addAlert({
 timestamp: Date.now(),
 type: 'connection_lost',
 severity: 'warning',
 message: `BLE 连接失败：${msg}`,
 resolved: false,
 })
 }
  }

  /** 主动断开 */
  async disconnect(): Promise<void> {
 this._clearReconnectTimer()
 if (this.device?.gatt?.connected) {
 this.device.gatt.disconnect()
 }
 await this._cleanup('disconnected')
  }

  /** 设置运行模式 */
  async setMode(mode: string): Promise<boolean> {
 return this._writeChar(BLE_UUIDS.CHAR_OPERATING_MODE, new Uint8Array([MODE_ENCODE[mode] ?? 0]), `setMode(${mode})`)
  }

  /** 设置充电限额 */
  async setChargeLimit(limit: number): Promise<boolean> {
 const clamped = Math.max(50, Math.min(100, limit))
 return this._writeChar(BLE_UUIDS.CHAR_CHARGE_LIMIT, new Uint8Array([clamped]), `setChargeLimit(${clamped})`)
  }

  /** 切换端口开关（portBit: 0=ac-out1,1=ac-out2,2=usb-out1,3=usb-out2） */
  async togglePort(portBit: number, enable: boolean): Promise<boolean> {
 const char = await this._getChar(BLE_UUIDS.CHAR_PORT_STATUS)
 if (!char) return false

 const current = await char.readValue()
 const bitmap = current.getUint8(0)
 const newBitmap = enable
 ? bitmap | (1 << portBit)
 : bitmap & ~(1 << portBit)

 return this._writeChar(BLE_UUIDS.CHAR_PORT_STATUS, new Uint8Array([newBitmap]), `togglePort(${portBit},${enable})`)
  }

  /** 订阅所有 Notifications */
  async subscribeNotifications(): Promise<void> {
 await this._subscribeChar(BLE_UUIDS.CHAR_BATTERY_LEVEL, (ev) => {
 const view = ((ev.target as unknown) as BluetoothRemoteGATTCharacteristic_).value!
 this.cb.onBatteryLevel(view.getUint8(0))
 })

 await this._subscribeChar(BLE_UUIDS.CHAR_POWER_DATA, (ev) => {
 const view = ((ev.target as unknown) as BluetoothRemoteGATTCharacteristic_).value!
 this.cb.onPowerData(this._decodePowerPacket(view))
 })

 await this._subscribeChar(BLE_UUIDS.CHAR_PORT_STATUS, (ev) => {
 const view = ((ev.target as unknown) as BluetoothRemoteGATTCharacteristic_).value!
 this.cb.onPortStatus(view.getUint8(0))
 })

 await this._subscribeChar(BLE_UUIDS.CHAR_OPERATING_MODE, (ev) => {
 const view = ((ev.target as unknown) as BluetoothRemoteGATTCharacteristic_).value!
 this.cb.onModeChange(MODE_DECODE[view.getUint8(0)] ?? 'solar')
 })
  }

  /** 主动读取一次所有数据（连接后初始化用） */
  async readAll(): Promise<void> {
 try {
 const battChar = await this._getChar(BLE_UUIDS.CHAR_BATTERY_LEVEL)
 if (battChar) {
 const val = await battChar.readValue()
 this.cb.onBatteryLevel(val.getUint8(0))
 }

 const powerChar = await this._getChar(BLE_UUIDS.CHAR_POWER_DATA)
 if (powerChar) {
 const val = await powerChar.readValue()
 this.cb.onPowerData(this._decodePowerPacket(val))
 }

 const portChar = await this._getChar(BLE_UUIDS.CHAR_PORT_STATUS)
 if (portChar) {
 const val = await portChar.readValue()
 this.cb.onPortStatus(val.getUint8(0))
 }

 const modeChar = await this._getChar(BLE_UUIDS.CHAR_OPERATING_MODE)
 if (modeChar) {
 const val = await modeChar.readValue()
 this.cb.onModeChange(MODE_DECODE[val.getUint8(0)] ?? 'solar')
 }
 } catch (err) {
 console.warn('[BLE] readAll 失败:', err)
 }
  }

  // ---- 内部方法 ------------------------------------------------

  private async _connectGATT(): Promise<void> {
 if (!this.device?.gatt) return

 this._emitStatus({ protocol: 'bluetooth', status: 'connecting', deviceName: this.device.name })

 try {
 this.server = await this.device.gatt.connect()

 // 缓存 Power Service 特征
 const svc = await this.server.getPrimaryService(BLE_UUIDS.POWER_SERVICE)
 const charUUIDs = [
 BLE_UUIDS.CHAR_BATTERY_LEVEL,
 BLE_UUIDS.CHAR_POWER_DATA,
 BLE_UUIDS.CHAR_PORT_STATUS,
 BLE_UUIDS.CHAR_OPERATING_MODE,
 BLE_UUIDS.CHAR_CHARGE_LIMIT,
 ]
 for (const uuid of charUUIDs) {
 try {
 this.chars[uuid] = await svc.getCharacteristic(uuid)
 } catch {
 // 固件版本差异，允许某些特征不存在
 }
 }

 this.reconnectAttempts = 0
 const rssi = await this.device.gatt?.connected ? -60 : undefined  // 模拟 RSSI

 this._emitStatus({
 protocol: 'bluetooth',
 status: 'connected',
 deviceName: this.device.name,
 deviceId: this.device.id,
 rssi,
 lastConnectedAt: Date.now(),
 })

 void logConnection({
 timestamp: Date.now(),
 protocol: 'bluetooth',
 deviceName: this.device.name ?? 'Unknown',
 deviceId: this.device.id,
 action: 'connected',
 })

 void addAlert({
 timestamp: Date.now(),
 type: 'connection_restored',
 severity: 'info',
 message: `已连接 BLE 设备：${this.device.name}`,
 resolved: false,
 })

 // 读取初始数据 + 订阅推送
 await this.readAll()
 await this.subscribeNotifications()
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err)
 this._emitStatus({ protocol: 'bluetooth', status: 'error', errorMessage: msg })
 this._scheduleReconnect()
 }
  }

  private _onDisconnected = async () => {
 this._emitStatus({ protocol: 'bluetooth', status: 'disconnected', deviceName: this.device?.name })

 void logConnection({
 timestamp: Date.now(),
 protocol: 'bluetooth',
 deviceName: this.device?.name ?? 'Unknown',
 deviceId: this.device?.id ?? '',
 action: 'disconnected',
 })

 this._scheduleReconnect()
  }

  private _scheduleReconnect(): void {
 if (this.reconnectAttempts >= this.MAX_RECONNECT) {
 void addAlert({
 timestamp: Date.now(),
 type: 'connection_lost',
 severity: 'critical',
 message: 'BLE 断线后多次重连失败，已停止尝试',
 resolved: false,
 })
 return
 }

 const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 30000)
 this.reconnectAttempts++

 this.reconnectTimer = setTimeout(async () => {
 if (this.device?.gatt && !this.device.gatt.connected) {
 await this._connectGATT()
 }
 }, delay)
  }

  private _clearReconnectTimer(): void {
 if (this.reconnectTimer) {
 clearTimeout(this.reconnectTimer)
 this.reconnectTimer = null
 }
  }

  private async _cleanup(status: ConnectionInfo['status']): Promise<void> {
 this.chars = {}
 this.server = null
 this._emitStatus({ protocol: 'bluetooth', status })
  }

  private async _getChar(uuid: string): Promise<BluetoothRemoteGATTCharacteristic_ | null> {
 if (this.chars[uuid]) return this.chars[uuid]!
 try {
 if (!this.server) return null
 const svc  = await this.server.getPrimaryService(BLE_UUIDS.POWER_SERVICE)
 const char = await svc.getCharacteristic(uuid)
 this.chars[uuid] = char
 return char
 } catch {
 return null
 }
  }

  private async _writeChar(uuid: string, data: Uint8Array, commandName: string): Promise<boolean> {
 const char = await this._getChar(uuid)
 if (!char) return false

 const t0 = Date.now()
 try {
 // 将 Uint8Array 转为 ArrayBuffer 以兼容 writeValueWithResponse 类型约束
 await char.writeValueWithResponse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
 void logCommand({
 timestamp: t0,
 source: 'user',
 protocol:  'bluetooth',
 command: commandName,
 payload: Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '),
 success: true,
 responseMs: Date.now() - t0,
 })
 return true
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err)
 void logCommand({
 timestamp: t0,
 source: 'user',
 protocol:  'bluetooth',
 command: commandName,
 success: false,
 responseMs: Date.now() - t0,
 })
 console.error('[BLE] 写入失败:', commandName, msg)
 return false
 }
  }

  private async _subscribeChar(
 uuid: string,
 handler: EventListenerOrEventListenerObject,
  ): Promise<void> {
 const char = await this._getChar(uuid)
 if (!char) return
 try {
 await char.startNotifications()
 char.addEventListener('characteristicvaluechanged', handler)
 } catch {
 // 该特征不支持 Notify，忽略
 }
  }

  /** 解码功率数据包 (6 bytes: int16×3 little-endian) */
  private _decodePowerPacket(view: DataView): BlePowerPacket {
 return {
 inputPower:  view.getInt16(0, true),
 outputPower: view.getInt16(2, true),
 temperature: view.getInt16(4, true) / 10,
 }
  }

  private _emitStatus(info: ConnectionInfo): void {
 this.cb.onStatusChange(info)
  }

  get isConnected(): boolean {
 return this.device?.gatt?.connected ?? false
  }

  get connectedDeviceName(): string | undefined {
 return this.device?.name
  }
}

// ----------------------------------------------------------------
// 单例导出（全应用共享一个 BleManager 实例）
// ----------------------------------------------------------------
let _bleInstance: BleManager | null = null

export function getBleManager(callbacks: BleCallbacks): BleManager {
  if (!_bleInstance) {
 _bleInstance = new BleManager(callbacks)
  }
  return _bleInstance
}

export function destroyBleManager(): void {
  _bleInstance = null
}

// ----------------------------------------------------------------
// 类型补全（浏览器环境）
// ----------------------------------------------------------------
declare global {
  interface BluetoothRemoteGATTCharacteristic {
 readValue(): Promise<DataView>
 writeValueWithResponse(value: ArrayBuffer | ArrayBufferView): Promise<void>
 startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
 addEventListener(
 type: 'characteristicvaluechanged',
 listener: EventListenerOrEventListenerObject,
 ): void
  }
}
