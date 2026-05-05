/**
 * 四色光伏开放平台 - API 客户端
 * 自动为每个请求注入 IOT 签名头（IOT-Open-AppID / IOT-Open-Nonce / IOT-Open-Sign）
 */

import { calcSign, parseUrlParams } from './iotSign'

// ─── 平台 Base URL（实际环境请修改）───
export const BASE_URL = 'https://api.solariot.com'   // TODO: 替换为实际域名

// ─── 响应结构 ───
export interface ApiResponse<T = unknown> {
  code: number | string
  message?: string
  msg?: string
  data?: T
}

// ─── Token 存储键 ───
const TOKEN_KEY = 'iot_access_token'

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

// ─── 核心 request 函数 ───

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** 是否跳过自动添加 Authorization（登录接口） */
  skipAuth?: boolean
}

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const method = (options.method ?? 'GET').toUpperCase()
  const bodyStr = options.body ?? ''

  // 解析 URL 参数（path 中可能含有 ? 查询串）
  const urlParams = parseUrlParams(path)

  // 计算签名
  const signHeaders = calcSign({
    method,
    urlParams,
    body: method !== 'GET' ? bodyStr : undefined,
  })

  // 构造请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    ...signHeaders,
    ...options.headers,
  }

  // 携带 Token（登录后）
  const token = tokenStore.get()
  if (token && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // 拼完整 URL
  const fullUrl = `${BASE_URL}${path}`

  const fetchOptions: RequestInit = {
    method,
    headers,
  }
  if (method !== 'GET' && bodyStr) {
    fetchOptions.body = bodyStr
  }

  const resp = await fetch(fullUrl, fetchOptions)
  const json = await resp.json()
  return json as ApiResponse<T>
}

// ─── 快捷方法 ───

export const api = {
  get<T = unknown>(path: string, headers?: Record<string, string>) {
    return request<T>(path, { method: 'GET', headers })
  },

  post<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>) {
    return request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : '',
      headers,
    })
  },

  postSkipAuth<T = unknown>(path: string, data?: unknown) {
    return request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : '',
      skipAuth: true,
    })
  },
}
