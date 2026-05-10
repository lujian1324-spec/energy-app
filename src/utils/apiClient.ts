/**
 * Sierro Inc. - API 客户端
 * T12: 增加错误处理 + 指数退避重试机制
 * 自动为每个请求注入 IOT 签名头（IOT-Open-AppID / IOT-Open-Nonce / IOT-Open-Sign）
 */

import { calcSign, parseUrlParams } from './iotSign'

// ─── 平台 Base URL ───
export const BASE_URL = 'https://solar.siseli.com/apis'

// ─── 响应结构 ───
export interface ApiResponse<T = unknown> {
  code: number | string
  message?: string
  msg?: string
  data?: T
}

// ─── 自定义 API 错误 ───
export class ApiError extends Error {
  constructor(
    public readonly code: number | string,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
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
  /** 是否跳过签名头注入（登录接口不验签） */
  skipSign?: boolean
  /** 最大重试次数（默认 2，网络错误时重试，业务错误不重试） */
  maxRetries?: number
  /** 初始重试延迟 ms（默认 600，指数退避） */
  retryDelay?: number
  /** 超时 ms（默认 10000） */
  timeout?: number
}

/** 指数退避 sleep */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    maxRetries = 2,
    retryDelay = 600,
    timeout = 10000,
  } = options

  const method = (options.method ?? 'GET').toUpperCase()
  const bodyStr = options.body ?? ''

  // 解析 URL 参数（path 中可能含有 ? 查询串）
  const urlParams = parseUrlParams(path)

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 计算签名（每次重试重新生成 nonce）
    const signHeaders = options.skipSign
      ? {}
      : calcSign({
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
      signal: AbortSignal.timeout(timeout),
    }
    if (method !== 'GET' && bodyStr) {
      fetchOptions.body = bodyStr
    }

    try {
      const resp = await fetch(fullUrl, fetchOptions)

      if (!resp.ok) {
        // HTTP 错误（4xx/5xx）— 不重试
        throw new ApiError(resp.status, `HTTP ${resp.status}: ${resp.statusText}`, resp.status)
      }

      const json = await resp.json() as ApiResponse<T>

      // 业务错误码（code !== 0/'200'/'success'）— 不重试，直接返回让调用方处理
      return json
    } catch (err) {
      lastError = err as Error

      // ApiError（HTTP 4xx/5xx）或 AbortError → 不重试
      if (err instanceof ApiError || (err as Error).name === 'AbortError') {
        throw err
      }

      // 最后一次重试失败后抛出
      if (attempt >= maxRetries) break

      // 指数退避：600ms, 1200ms, 2400ms...
      await sleep(retryDelay * Math.pow(2, attempt))
    }
  }

  throw lastError ?? new Error('Request failed after retries')
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

  /** 不验签、不携带 Authorization（登录接口） */
  postNoSign<T = unknown>(path: string, data?: unknown) {
    return request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : '',
      skipAuth: true,
      skipSign: true,
    })
  },
}
