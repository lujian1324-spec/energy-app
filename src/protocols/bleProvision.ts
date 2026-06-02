/**
 * BLE 配网管理器
 *
 * 通过 Web Bluetooth API 与采集器通信，实现蓝牙配网功能。
 * 使用 Service FEE7, Write FED5, Indicate FED6 通道。
 *
 * 通信流程:
 * 发送: JSON → AES加密 → Base64 → 分包 → Write to FED5
 * 接收: FED6 Indication → 收集分包 → 组包 → Base64解码 → AES解密 → JSON
 */
import {
  BLE_PROVISION_UUIDS,
  BLE_PROVISION_MTU,
  type BleProvisionResponse,
  type BleWifiAp,
  type BleWifiStatus,
} from '../types/protocol'
import { encrypt, decrypt } from '../utils/bleCrypto'
import { buildPackets, reassemblePackets, stringToBytes, bytesToString } from '../utils/blePacket'
import { parseBleName } from '../utils/dtuidParser'

export interface ProvisionCallbacks {
  onLog?: (msg: string) => void
  onDisconnected?: () => void
}

export class BleProvisionManager {
  private device: BluetoothDevice | null = null
  /** 获取蓝牙设备实例（用于 UI 显示设备名称） */
  get btDevice(): BluetoothDevice | null { return this.device }
  private server: BluetoothRemoteGATTServer | null = null
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null
  private indicateChar: BluetoothRemoteGATTCharacteristic | null = null
  private dtuid: string | null = null

  // 应答收集
  private responseResolve: ((value: BleProvisionResponse) => void) | null = null
  private responseReject: ((reason: Error) => void) | null = null
  private receivedPackets: Uint8Array[] = []
  private expectedSeqNum = 0
  private receivedSeqNo = 0
  private responseTimeout: ReturnType<typeof setTimeout> | null = null

  private cb: ProvisionCallbacks
  private disconnectListener: (() => void) | null = null

  constructor(callbacks: ProvisionCallbacks = {}) {
    this.cb = callbacks
  }

  /** 获取当前 DTUID */
  getDuid(): string | null { return this.dtuid }

  /**
   * 扫描并连接蓝牙设备
   * @param dtuid 可选，指定 DTUID 的 base64 后缀进行过滤
   */
  async connect(dtuid?: string): Promise<void> {
    this.log('扫描蓝牙设备...')

    const filter: RequestDeviceOptions = {
      optionalServices: [BLE_PROVISION_UUIDS.SERVICE],
      acceptAllDevices: true,
    }

    this.device = await navigator.bluetooth.requestDevice(filter)

    this.device.addEventListener('gattserverdisconnected', this.handleDisconnect)

    this.log(`正在连接 ${this.device.name}...`)
    this.server = await this.device.gatt!.connect()

    // 获取服务
    this.log('获取 GATT 服务...')
    const service = await this.server.getPrimaryService(BLE_PROVISION_UUIDS.SERVICE)

    // 获取特征
    this.writeChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.WRITE_TX)
    this.indicateChar = await service.getCharacteristic(BLE_PROVISION_UUIDS.INDICATE_RX)

    // 订阅 indication（设备应答通道）
    await this.indicateChar.startNotifications()
    this.indicateChar.addEventListener('characteristicvaluechanged', this.handleIndication)

    // 解析设备名称获取 DTUID
    if (this.device.name) {
      const parsed = parseBleName(this.device.name)
      if (parsed) {
        this.dtuid = parsed.dtuid
        this.log(`设备 DTUID: ${this.dtuid}, WiFi 状态: ${parsed.status}`)
      } else {
        this.log(`警告: 无法解析设备名称 "${this.device.name}"`)
      }
    }

    // 协商 MTU
    try {
      // Web Bluetooth API 不直接暴露 MTU 协商，浏览器自动处理
      // 实际 MTU 可能小于 240，我们在分包时按 240 处理
      this.log('GATT 连接成功')
    } catch {
      this.log('MTU 协商跳过（浏览器自动处理）')
    }
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    this.clearTimeout()
    this.cleanupResponse()

    if (this.indicateChar) {
      try {
        await this.indicateChar.stopNotifications()
      } catch { /* ignore */ }
      this.indicateChar.removeEventListener('characteristicvaluechanged', this.handleIndication)
    }

    if (this.disconnectListener && this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.disconnectListener)
    }

    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }

    this.device = null
    this.server = null
    this.writeChar = null
    this.indicateChar = null
    this.dtuid = null
    this.log('已断开连接')
  }

  /**
   * 发送命令并等待应答
   * @param commandJson 命令 JSON 对象 (如 { CID: 30001 })
   * @param dtuid 可选覆盖 DTUID
   * @param timeout 超时毫秒数
   */
  async sendCommand<T = BleProvisionResponse>(
    commandJson: object,
    dtuid?: string,
    timeout = 15000,
  ): Promise<T> {
    if (!this.writeChar || !this.dtuid && !dtuid) {
      throw new Error('BLE 未连接或 DTUID 未知')
    }

    const key = dtuid || this.dtuid!

    // 1. 加密
    this.log(`发送命令: ${JSON.stringify(commandJson)}`)
    const encrypted = encrypt(commandJson, key)

    // 2. 分包
    const packets = buildPackets(encrypted)
    this.log(`分包 ${packets.length} 包，数据长度 ${encrypted.length}`)

    // 3. 准备接收
    this.cleanupResponse()
    this.receivedPackets = []
    this.receivedSeqNo = 0

    // 4. 发送所有包
    for (let i = 0; i < packets.length; i++) {
      this.log(`发送第 ${i + 1}/${packets.length} 包...`)
      await this.writeChar.writeValueWithoutResponse(packets[i].buffer as ArrayBuffer)
      // 包间延迟 50ms，避免设备缓冲区溢出
      if (i < packets.length - 1) {
        await this.sleep(50)
      }
    }

    // 5. 等待应答（带超时）
    return new Promise<T>((resolve, reject) => {
      this.responseResolve = resolve as (v: BleProvisionResponse) => void
      this.responseReject = reject

      this.responseTimeout = setTimeout(() => {
        this.cleanupResponse()
        reject(new Error('等待设备应答超时'))
      }, timeout)
    })
  }

  // ─── 便捷方法 ───

  /** 获取设备版本信息 (CID 30001) */
  async getVersion(): Promise<BleProvisionResponse<{ SV: string; HV: string }>> {
    return this.sendCommand({ CID: 30001 })
  }

  /** 扫描 WiFi AP 列表 (CID 30003) */
  async scanAp(): Promise<BleProvisionResponse<BleWifiAp[]>> {
    return this.sendCommand({ CID: 30003 }, undefined, 30000) // AP扫描可能需要更长时间
  }

  /** 配置 WiFi (CID 30005) */
  async configWifi(ssid: string, key: string): Promise<BleProvisionResponse> {
    return this.sendCommand({
      CID: 30005,
      PL: { SSID: ssid, Key: key },
    })
  }

  /** 重启设备 (CID 30007) */
  async restart(): Promise<BleProvisionResponse> {
    return this.sendCommand({ CID: 30007 })
  }

  /** 获取 WiFi 连接状态 (CID 30020) */
  async getWifiStatus(): Promise<BleProvisionResponse<BleWifiStatus>> {
    return this.sendCommand({ CID: 30020 })
  }

  /** 确认蓝牙密码 (CID 30050) */
  async confirmBleKey(bleKey: string): Promise<BleProvisionResponse> {
    return this.sendCommand({
      CID: 30050,
      PL: { BleKey: bleKey },
    })
  }

  // ─── 内部方法 ───

  /** 处理 Indication 事件（设备应答） */
  private handleIndication = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic
    if (!target.value) return

    const data = new Uint8Array(target.value.buffer)

    // 解析帧头: [seqNo][seqNum][dataLen]
    if (data.length < 3) return

    const seqNo = data[0]
    const seqNum = data[1]
    const dataLen = data[2]

    this.log(`收到应答包 ${seqNo}/${seqNum}, 数据长度 ${dataLen}`)

    // 收集分包
    this.receivedPackets.push(data)
    this.receivedSeqNo = seqNo
    this.expectedSeqNum = seqNum

    // 判断是否收完所有包
    if (seqNo >= seqNum) {
      // 合并分包
      const rawStr = reassemblePackets(this.receivedPackets)
      this.log(`应答数据合并完成，长度 ${rawStr.length}`)

      // 解密
      try {
        const key = this.dtuid!
        const response = decrypt<BleProvisionResponse>(rawStr, key)
        this.log(`应答: CID=${response.CID}, RC=${response.RC}`)

        this.clearTimeout()
        const resolve = this.responseResolve
        this.cleanupResponse()

        if (resolve) {
          resolve(response)
        }
      } catch (err) {
        this.log(`解密失败: ${err instanceof Error ? err.message : String(err)}`)
        this.clearTimeout()
        const reject = this.responseReject
        this.cleanupResponse()
        if (reject) {
          reject(new Error(`应答解密失败: ${err instanceof Error ? err.message : String(err)}`))
        }
      }
    }
  }

  /** 处理断开连接 */
  private handleDisconnect = (): void => {
    this.log('设备已断开连接')
    this.cleanupResponse()
    this.clearTimeout()
    this.cb.onDisconnected?.()
  }

  private clearTimeout(): void {
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
      this.responseTimeout = null
    }
  }

  private cleanupResponse(): void {
    this.responseResolve = null
    this.responseReject = null
    this.receivedPackets = []
    this.receivedSeqNo = 0
    this.expectedSeqNum = 0
  }

  private log(msg: string): void {
    this.cb.onLog?.(msg)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ─── 单例 ───

let instance: BleProvisionManager | null = null

export function getProvisionManager(callbacks?: ProvisionCallbacks): BleProvisionManager {
  if (!instance) {
    instance = new BleProvisionManager(callbacks)
  }
  return instance
}

export function destroyProvisionManager(): void {
  if (instance) {
    instance.disconnect().catch(err => console.error('[bleProvision] disconnect failed:', err))
    instance = null
  }
}
