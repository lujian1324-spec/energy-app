/**
 * 四色光伏开放平台 - 接口签名工具
 * 文档版本: v2024090201
 *
 * 签名算法:
 * 1. 计算 Body SHA256 Hash (GET 请求为空字符串)
 * 2. 合并 URL 参数 + 公共参数 (IOT-Open-AppID / IOT-Open-Nonce / IOT-Open-Body-Hash)
 * 3. 按参数名字典序排序
 * 4. 拼接为 key=val&key2=val2... (UTF-8 原始值，不做 URL 编码)
 * 5. Base64(UTF-8)
 * 6. HmacSHA256(base64String, AppSecret)
 * 7. MD5(hmacBytes) => 最终签名
 */

// ───────── 依赖：crypto-js ─────────
import CryptoJS from 'crypto-js'

// ───────── 应用凭据 ─────────
export const APP_ID = 'rYGQpmYU5k'
export const APP_SECRET = 'GhJXQYEHphHlyiqYnBGE'

// ───────── 工具函数 ─────────

/** 生成 32 位随机字符串（UUID hex，去掉连字符） */
export function generateNonce(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** SHA256 十六进制小写 */
function sha256Hex(text: string): string {
  return CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(text)).toString(CryptoJS.enc.Hex).toLowerCase()
}

/** Base64 (UTF-8) */
function toBase64(text: string): string {
  const wordArray = CryptoJS.enc.Utf8.parse(text)
  return CryptoJS.enc.Base64.stringify(wordArray)
}

/** HmacSHA256，返回 WordArray */
function hmacSHA256(message: string, key: string): CryptoJS.lib.WordArray {
  return CryptoJS.HmacSHA256(message, key)
}

/** MD5 十六进制小写 */
function md5Hex(data: CryptoJS.lib.WordArray): string {
  return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex).toLowerCase()
}

// ───────── 主签名函数 ─────────

export interface SignHeaders {
  'IOT-Open-AppID': string
  'IOT-Open-Nonce': string
  'IOT-Open-Sign': string
}

export interface SignOptions {
  /** HTTP 方法，GET / POST 等，大写 */
  method: string
  /** URL 查询参数 key-value 对象（原始值，不做 URL 编码） */
  urlParams?: Record<string, string>
  /** 请求 Body 字符串（仅 POST/PUT 等非 GET 请求需要传） */
  body?: string
  /** 覆盖 nonce（测试用） */
  nonce?: string
}

/**
 * 计算签名并返回需要注入到请求头的三个字段
 */
export function calcSign(options: SignOptions): SignHeaders {
  const { method, urlParams = {}, body = '', nonce = generateNonce() } = options

  // Step 1: Body Hash
  const isGet = method.toUpperCase() === 'GET'
  const bodyHash = isGet ? '' : sha256Hex(body)

  // Step 2 & 3: 合并参数并排序
  const allParams: Record<string, string> = {
    ...urlParams,
    'IOT-Open-AppID': APP_ID,
    'IOT-Open-Nonce': nonce,
    'IOT-Open-Body-Hash': bodyHash,
  }

  // 忽略 URL 参数中与公共参数同名的项（已被公共参数覆盖）
  const sorted = Object.entries(allParams).sort(([a], [b]) => a.localeCompare(b))

  // Step 4: 拼接
  const plainText = sorted.map(([k, v]) => `${k}=${v}`).join('&')

  // Step 5: Base64
  const base64Text = toBase64(plainText)

  // Step 6: HmacSHA256
  const hmacResult = hmacSHA256(base64Text, APP_SECRET)

  // Step 7: MD5
  const sign = md5Hex(hmacResult)

  return {
    'IOT-Open-AppID': APP_ID,
    'IOT-Open-Nonce': nonce,
    'IOT-Open-Sign': sign,
  }
}

/** 解析 URL 查询字符串为 key-value 对象（原始值） */
export function parseUrlParams(url: string): Record<string, string> {
  const idx = url.indexOf('?')
  if (idx === -1) return {}
  const query = url.slice(idx + 1)
  const result: Record<string, string> = {}
  for (const part of query.split('&')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) continue
    const key = part.slice(0, eqIdx)
    const val = decodeURIComponent(part.slice(eqIdx + 1))
    result[key] = val
  }
  return result
}
