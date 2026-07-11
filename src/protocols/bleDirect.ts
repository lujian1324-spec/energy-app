/**
 * 蓝牙直连模式 — 云端不可达时（或纯本地场景）绕过云端，直接通过 BLE 透传
 * Modbus 帧读取实时状态 / 下发基础控制。
 *
 * 建立在两个已有模块之上，不引入新的传输层：
 *   - bleProvision.ts  已实现的 CID/JSON 命令通道（AES 加密、MTU 分包、Web+原生双后端），
 *     本模块只新增使用其 uartPassthrough()（CID 30024/30025）。
 *   - modbusProtocol.ts 已有的、与传输方式无关的 Modbus 帧构造/解析（FRAMES、decodeLiveStatus）。
 *
 * 范围（与云端控制的差异，见 CLAUDE.md 直连模式章节）：
 *   - Ports 只有 AC / DC 两路（寄存器 0x0080 高/低字节），不是云端的 AC1/AC2/USB 三路——
 *     三路映射由云端/固件在服务端完成，原始 Modbus 接口不提供。
 *   - Sleep Mode 是"立即下发一次目标功率"，不是完整的时间窗口调度（那依赖云端保存的排程
 *     和持续在线的巡检，不适合一次性直连会话）。
 */
import {
  FRAMES,
  fromHexString,
  parseReadResponse,
  decodeLiveStatus,
  type LiveStatus,
} from './modbusProtocol'
import {
  getProvisionManager,
  destroyProvisionManager,
  supportsDeviceListScan,
  type IBleProvisionManager,
  type ProvisionCallbacks,
  type ProvisionScanDevice,
} from './bleProvision'
import { getPowers } from '../hooks/useSleepModeScheduler'

export { supportsDeviceListScan, type ProvisionScanDevice }

/** 建立直连会话；原生走列表扫描由调用方选取，Web 走系统选择器（见 connectDirectWeb） */
export function getDirectManager(callbacks?: ProvisionCallbacks): IBleProvisionManager {
  return getProvisionManager(callbacks)
}

/** 原生：扫描附近设备，回调式上报，调用方自行决定何时 stopScan / connectTo */
export async function scanForDirectDevices(
  onFound: (d: ProvisionScanDevice) => void,
  callbacks?: ProvisionCallbacks,
): Promise<IBleProvisionManager> {
  const manager = getDirectManager(callbacks)
  await manager.scanDevices(onFound)
  return manager
}

/** 原生：连接扫描结果中选定的设备 */
export async function connectDirectTo(deviceId: string, name?: string): Promise<void> {
  await getDirectManager().connectTo(deviceId, name)
}

/** Web：系统蓝牙选择器（单设备，无法预先列表展示） */
export async function connectDirectWeb(callbacks?: ProvisionCallbacks): Promise<void> {
  await getDirectManager(callbacks).connect()
}

/** 断开并清理直连会话，回到云端模式 */
export async function disconnectDirect(): Promise<void> {
  destroyProvisionManager()
}

/** 发送一个只关心 RC===0 的控制帧（端口/睡眠功率等一次性写入） */
async function applyFrame(mgr: IBleProvisionManager, hex: string): Promise<boolean> {
  try {
    const rpl = await mgr.uartPassthrough(hex)
    return rpl.RC === 0
  } catch {
    return false
  }
}

/** 读取实时状态（电量/AC/Solar/Output/温度）——与云端 LiveStatus 同形，可直接喂给 UI */
export async function readLiveStatusBle(mgr: IBleProvisionManager): Promise<LiveStatus | null> {
  try {
    const rpl = await mgr.uartPassthrough(FRAMES.READ_ALL_STATUS)
    if (rpl.RC !== 0 || !rpl.PL?.Rsp) return null
    const parsed = parseReadResponse(fromHexString(rpl.PL.Rsp))
    if (!parsed || !parsed.crcOk) return null
    return decodeLiveStatus(parsed.registers)
  } catch {
    return null
  }
}

/** AC 输出开关（寄存器 0x0080 高字节） */
export function setAcOutputBle(mgr: IBleProvisionManager, on: boolean): Promise<boolean> {
  return applyFrame(mgr, on ? FRAMES.AC_POWER_ON : FRAMES.AC_POWER_OFF)
}

/** DC/USB 输出开关（寄存器 0x0080 低字节） */
export function setDcOutputBle(mgr: IBleProvisionManager, on: boolean): Promise<boolean> {
  return applyFrame(mgr, on ? FRAMES.DC_POWER_ON : FRAMES.DC_POWER_OFF)
}

/**
 * 立即下发一次 Sleep/Wake 目标充电功率（寄存器 0x0085），
 * 复用 useSleepModeScheduler.ts 里已验证过的按机型取值逻辑。
 * 注意：这只是一次性写入，不会启动/维持时间窗口调度。
 */
export function setSleepPowerBle(mgr: IBleProvisionManager, model: string, sleep: boolean): Promise<boolean> {
  const { sleepW, wakeW } = getPowers(model)
  return applyFrame(mgr, FRAMES.setAcChargePowerRt(sleep ? sleepW : wakeW))
}
