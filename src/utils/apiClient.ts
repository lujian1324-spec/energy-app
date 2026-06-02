/**
 * Sierro Inc. - API 客户端
 * 自动为每个请求注入 IOT 签名头（IOT-Open-AppID / IOT-Open-Nonce / IOT-Open-Sign / IOT-Open-Body-Hash）
 * Token 通过 IOT-Token 请求头传输（非 Authorization Bearer）
 * Body 使用紧凑 JSON（separators=(",", ":")）
 */

import { calcSign, parseUrlParams } from './iotSign'

// ─── 平台 Base URL ───
export const BASE_URL = 'https://solar.siseli.com/apis'

// ─── 响应结构 ───
export interface ApiResponse<T = unknown> {
  code: number | string
  message?: string
  msg?: string
  localMessage?: string
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
const REFRESH_TOKEN_KEY = 'iot_refresh_token'

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
  getRefresh: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefresh: (token: string) => localStorage.setItem(REFRESH_TOKEN_KEY, token),
}

// ─── Auth 过期判定码 ───
const AUTH_EXPIRED_CODES = new Set([401, '401', 1001, '1001', 1002, '1002'])

function isAuthExpired(code: number | string): boolean {
  return AUTH_EXPIRED_CODES.has(code)
}

// ─── Token 刷新单例 ───
let refreshPromise: Promise<string | null> | null = null

async function doRefreshToken(): Promise<string | null> {
  const accessToken = tokenStore.get()
  const refreshToken = tokenStore.getRefresh()
  if (!accessToken || !refreshToken) return null

  try {
    const result = await requestInternal<{ accessToken?: string; refreshToken?: string }>(
      '/login/refresh/access/token',
      {
        method: 'POST',
        body: compactStringify({ accessToken, refreshToken }),
        skipAuth: true,
        _isRefresh: true,
      }
    )
    if (result.data?.accessToken) {
      tokenStore.set(result.data.accessToken)
      if (result.data.refreshToken) tokenStore.setRefresh(result.data.refreshToken)
      return result.data.accessToken
    }
    return null
  } catch {
    return null
  }
}

function getOrCreateRefreshPromise(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefreshToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/** 紧凑 JSON 序列化（无空格，与平台要求一致） */
const compactStringify = (data: unknown): string => JSON.stringify(data)

// ─── 核心 request 函数 ───

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** 是否跳过自动添加 IOT-Token（登录接口） */
  skipAuth?: boolean
  /** 是否跳过签名头注入（不推荐，平台大部分接口都需验签） */
  skipSign?: boolean
  /** 最大重试次数（默认 2，网络错误时重试，业务错误不重试） */
  maxRetries?: number
  /** 初始重试延迟 ms（默认 600，指数退避） */
  retryDelay?: number
  /** 超时 ms（默认 10000） */
  timeout?: number
  /** 内部标记：是否为 Token 刷新请求（避免递归刷新） */
  _isRefresh?: boolean
  /** 内部标记：是否已重试过（避免无限刷新重试） */
  _retriedAfterRefresh?: boolean
}

/** 指数退避 sleep */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function requestInternal<T = unknown>(
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
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'Origin': 'https://solar.siseli.com',
      'Referer': 'https://solar.siseli.com/',
      ...signHeaders,
      ...options.headers,
    }

    // 携带 Token（登录后，使用 IOT-Token 头）
    const token = tokenStore.get()
    if (token && !options.skipAuth) {
      headers['IOT-Token'] = token
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

      // 业务错误码（code !== 0）— 不重试，直接返回让调用方处理
      return json
    } catch (err) {
      lastError = err as Error

      // ApiError（HTTP 4xx/5xx）、AbortError 或 TimeoutError → 不重试
      const errName = (err as Error).name
      if (err instanceof ApiError || errName === 'AbortError' || errName === 'TimeoutError') {
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

// ─── 带 Token 自动刷新的 request 包装 ───

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const result = await requestInternal<T>(path, options)

  // Token 刷新请求本身不拦截
  if (options._isRefresh) return result

  // 检测 auth 过期
  if (isAuthExpired(result.code) && !options.skipAuth && !options._retriedAfterRefresh) {
    const newToken = await getOrCreateRefreshPromise()
    if (newToken) {
      // 刷新成功，重试原请求
      return requestInternal<T>(path, {
        ...options,
        _retriedAfterRefresh: true,
      })
    }
    // 刷新失败，广播事件通知 authStore 清除登录状态
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    throw new ApiError(result.code, result.message ?? result.msg ?? 'Session expired', 401)
  }

  return result
}

// ─── 快捷方法 ───

export const api = {
  get<T = unknown>(path: string, headers?: Record<string, string>) {
    return request<T>(path, { method: 'GET', headers })
  },

  post<T = unknown>(path: string, data?: unknown, headers?: Record<string, string>) {
    return request<T>(path, {
      method: 'POST',
      body: data !== undefined ? compactStringify(data) : '',
      headers,
    })
  },

  /** 带签名但不带 IOT-Token（登录接口使用） */
  postSkipAuth<T = unknown>(path: string, data?: unknown) {
    return request<T>(path, {
      method: 'POST',
      body: data !== undefined ? compactStringify(data) : '',
      skipAuth: true,
    })
  },

  /** 不验签、不携带 IOT-Token（仅用于不验签的接口） */
  postNoSign<T = unknown>(path: string, data?: unknown) {
    return request<T>(path, {
      method: 'POST',
      body: data !== undefined ? compactStringify(data) : '',
      skipAuth: true,
      skipSign: true,
    })
  },
}
