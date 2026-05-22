/**
 * BLE 配网加密/解密工具
 *
 * 加密流程: JSON → AES-128-CBC-ZeroPadding → Base64
 * 解密流程: Base64 → AES-128-CBC-ZeroPadding → JSON
 *
 * AES Key = MD5(DTUID + "SEC_") — 32位hex字符串
 * IV = Key（与 Key 相同）
 */
import CryptoJS from 'crypto-js'

const PREFIX = 'SEC_'

/** 计算 AES Key: MD5(DTUID + "SEC_") 返回 32 位 hex 字符串 */
export function computeAesKey(dtuid: string): string {
  const raw = dtuid + PREFIX
  return CryptoJS.MD5(raw).toString(CryptoJS.enc.Hex)
}

/** 解析 hex 字符串为 CryptoJS WordArray 格式的 key/iv */
function parseHex(hex: string): CryptoJS.lib.WordArray {
  return CryptoJS.enc.Hex.parse(hex)
}

/** 加密: JSON 对象 → Base64 字符串 */
export function encrypt(jsonData: object, dtuid: string): string {
  const keyHex = computeAesKey(dtuid)
  const key = parseHex(keyHex)
  const iv = parseHex(keyHex)

  const jsonString = JSON.stringify(jsonData)

  // AES-128-CBC with ZeroPadding (Pkcs7 padding disabled)
  const encrypted = CryptoJS.AES.encrypt(jsonString, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding,
  })

  // encrypted.toString() 自动输出 Base64
  return encrypted.toString()
}

/** 解密: Base64 字符串 → JSON 对象 */
export function decrypt<T = unknown>(base64Str: string, dtuid: string): T {
  const keyHex = computeAesKey(dtuid)
  const key = parseHex(keyHex)
  const iv = parseHex(keyHex)

  const decrypted = CryptoJS.AES.decrypt(base64Str, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding,
  })

  // 将 decrypted WordArray 转为 UTF-8 字符串
  const jsonString = decrypted.toString(CryptoJS.enc.Utf8)

  return JSON.parse(jsonString) as T
}
