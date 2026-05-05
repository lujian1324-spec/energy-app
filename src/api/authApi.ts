/**
 * 四色光伏开放平台 - 认证 API
 * 登录接口: POST /login/account
 * 登录接口受签名拦截（/login/** 除 /login/logout 均拦截）
 */

import { api, tokenStore, ApiResponse } from '../utils/apiClient'

// ─── 请求/响应类型 ───

export interface LoginRequest {
  /** 账号（用户名/手机/邮箱） */
  username: string
  /** 密码 */
  password: string
}

export interface LoginData {
  token?: string
  accessToken?: string
  userId?: string
  username?: string
  [key: string]: unknown
}

// ─── 登录 ───
export async function loginByAccount(
  username: string,
  password: string
): Promise<ApiResponse<LoginData>> {
  const payload: LoginRequest = { username, password }
  // 登录接口不需要携带 Authorization，但需要签名头
  const result = await api.postSkipAuth<LoginData>('/login/account', payload)

  // 自动保存 token
  const token = result.data?.token ?? result.data?.accessToken
  if (token) {
    tokenStore.set(token)
  }

  return result
}

// ─── 退出登录 ───
export async function logout(): Promise<void> {
  try {
    await api.post('/login/logout')
  } catch {
    // 忽略退出错误
  } finally {
    tokenStore.clear()
  }
}

// ─── 是否已登录 ───
export function isLoggedIn(): boolean {
  return !!tokenStore.get()
}
