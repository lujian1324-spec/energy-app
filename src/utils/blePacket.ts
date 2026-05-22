/**
 * BLE 配网分包/组包工具
 *
 * 分包格式: [seqNo(1B)][seqNum(1B)][dataLen(1B)][data]
 * seqNo: 从 1 开始的包序号
 * seqNum: 总包数
 * dataLen: 本包数据长度
 * MTU: 240 字节，头 3 字节，单包最大数据 = 237 字节
 */
import { BLE_PROVISION_MTU, BLE_PACKET_HEADER_SIZE } from '../types/protocol'

const MAX_DATA_PER_PACKET = BLE_PROVISION_MTU - BLE_PACKET_HEADER_SIZE // 237

/** 将普通字符串转为 Uint8Array (UTF-8) */
export function stringToBytes(str: string): Uint8Array {
  const encoder = new TextEncoder()
  return encoder.encode(str)
}

/** 将 Uint8Array 转为普通字符串 (UTF-8) */
export function bytesToString(bytes: Uint8Array): string {
  const decoder = new TextDecoder()
  return decoder.decode(bytes)
}

/** hex 字符串转 Uint8Array (如 "0101AC" → [0x01, 0x01, 0xAC]) */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Uint8Array 转 hex 字符串 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 将加密后的数据字符串分包
 * 输入: Base64 编码后的字符串
 * 输出: 多个 Uint8Array 包，每个包格式 [seqNo][seqNum][dataLen][data]
 */
export function buildPackets(data: string): Uint8Array[] {
  const dataBytes = stringToBytes(data)
  const totalLen = dataBytes.length
  const totalPackets = Math.ceil(totalLen / MAX_DATA_PER_PACKET)

  const packets: Uint8Array[] = []

  for (let i = 0; i < totalPackets; i++) {
    const start = i * MAX_DATA_PER_PACKET
    const end = Math.min(start + MAX_DATA_PER_PACKET, totalLen)
    const chunk = dataBytes.slice(start, end)

    const packet = new Uint8Array(BLE_PACKET_HEADER_SIZE + chunk.length)
    packet[0] = i + 1 // seqNo (1-based)
    packet[1] = totalPackets // seqNum
    packet[2] = chunk.length // dataLen
    packet.set(chunk, BLE_PACKET_HEADER_SIZE)

    packets.push(packet)
  }

  return packets
}

/**
 * 合并多个分包为完整数据
 * 输入: 多个 Uint8Array (每个为完整的包)
 * 输出: 去掉帧头后的 data 字符串
 */
export function reassemblePackets(fragments: Uint8Array[]): string {
  // 收集所有 data 部分（去掉前 3 字节帧头）
  const allData: number[] = []
  for (const frag of fragments) {
    if (frag.length < BLE_PACKET_HEADER_SIZE) continue
    const dataLen = frag[2]
    const data = frag.slice(BLE_PACKET_HEADER_SIZE, BLE_PACKET_HEADER_SIZE + dataLen)
    for (let i = 0; i < data.length; i++) {
      allData.push(data[i])
    }
  }

  const combined = new Uint8Array(allData)
  return bytesToString(combined)
}
