/**
 * Sierro Inc. - 认证与用户 API
 *
 * 登录接口: POST /login/account
 * 注册接口: POST /user/register/email | /user/register/cellphone
 * 退出接口: POST /login/logout
 * Token 刷新: POST /login/refresh/access/token
 * 用户信息: POST /user/select/iotUserInfo
 * 修改密码: POST /user/update/authPassword
 * 找回密码: POST /user/reset/password
 * 账号校验: GET  /user/account/check
 * 邮箱校验: GET  /user/email/check
 * 发送验证码: POST /user/send/sms/captcha | /user/send/email/captcha
 *
 * 重要：密码需 MD5 加密后传输（平台要求，明文密码会返回 code 7）
 * 登录接口受签名拦截，但不需 IOT-Token（使用 postSkipAuth）
 */

import CryptoJS from 'crypto-js'
import { api, tokenStore, ApiResponse } from '../utils/apiClient'

// ═══════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════

/** 登录请求 */
export interface LoginRequest {
  account: string
  password: string // MD5 加密后
}

/** 登录响应 data */
export interface LoginData {
  accessToken?: string
  refreshToken?: string
  accessTokenWillExpiredAt?: string
  accessTokenWillExpiredInMillis?: number
  refreshTokenWillExpiredAt?: string
  refreshTokenWillExpiredInMillis?: number
  account?: string
  authId?: number
  userId?: number
  userType?: number
  isAdmin?: boolean
  isDealer?: boolean
  isDeviceManufacturer?: boolean
  isIntegrator?: boolean
  isOfficialStaff?: boolean
  isStationOwner?: boolean
  ticket?: string
  themeColor?: string
  [key: string]: unknown
}

/** 注册请求 */
export interface RegisterRequest {
  account: string       // 账号名
  password: string       // MD5 加密后
  email?: string        // 邮箱注册时必填
  cellphone?: string    // 手机注册时必填
  countryTelephoneCode?: string  // 手机区号，如 "+1"
  captcha?: string      // 验证码
  nickname?: string     // 昵称
}

/** 用户信息 */
export interface UserInfo {
  userId?: number
  account?: string
  nickname?: string
  email?: string
  cellphone?: string
  countryTelephoneCode?: string
  avatarUrl?: string
  userType?: number
  isAdmin?: boolean
  isStationOwner?: boolean
  isIntegrator?: boolean
  isDealer?: boolean
  [key: string]: unknown
}

/** 修改密码请求 */
export interface UpdatePasswordRequest {
  oldPassword: string   // MD5 加密后
  newPassword: string   // MD5 加密后
}

/** 找回密码请求 */
export interface ResetPasswordRequest {
  account: string
  newPassword: string   // MD5 加密后
  captcha?: string       // 验证码
  email?: string
  cellphone?: string
  countryTelephoneCode?: string
}

/** 发送验证码请求 */
export interface SendCaptchaRequest {
  email?: string
  cellphone?: string
  countryTelephoneCode?: string
  intent?: string  // 用途：register / resetPassword / updateEmail 等
}

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

/** 将明文密码转为 MD5 十六进制小写（平台要求） */
export function md5Password(plainPassword: string): string {
  return CryptoJS.MD5(plainPassword).toString(CryptoJS.enc.Hex).toLowerCase()
}

// ═══════════════════════════════════════════════════════
// 登录
// ═══════════════════════════════════════════════════════

/** 账号密码登录 */
export async function loginByAccount(
  username: string,
  plainPassword: string
): Promise<ApiResponse<LoginData>> {
  const payload: LoginRequest = {
    account: username,
    password: md5Password(plainPassword),
  }
  const result = await api.postSkipAuth<LoginData>('/login/account', payload)

  // 仅在业务成功时保存 token
  if ((result.code === 0 || result.code === '0') && result.data) {
    const accessToken = result.data.accessToken
    if (accessToken) tokenStore.set(accessToken)
    const refreshToken = result.data.refreshToken
    if (refreshToken) tokenStore.setRefresh(refreshToken)
  }

  return result
}

// ═══════════════════════════════════════════════════════
// 注册
// ═══════════════════════════════════════════════════════

/** 邮箱注册 */
export async function registerByEmail(
  account: string,
  plainPassword: string,
  email: string,
  captcha?: string
): Promise<ApiResponse<unknown>> {
  return api.postSkipAuth<unknown>('/user/register/email', {
    account,
    password: md5Password(plainPassword),
    email,
    captcha,
  })
}

/** 手机注册 */
export async function registerByCellphone(
  account: string,
  plainPassword: string,
  cellphone: string,
  countryTelephoneCode: string,
  captcha?: string
): Promise<ApiResponse<unknown>> {
  return api.postSkipAuth<unknown>('/user/register/cellphone', {
    account,
    password: md5Password(plainPassword),
    cellphone,
    countryTelephoneCode,
    captcha,
  })
}

/** 校验账号是否存在 */
export async function checkAccountExists(account: string): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/user/account/check?account=${encodeURIComponent(account)}`)
}

/** 校验邮箱是否存在 */
export async function checkEmailExists(email: string): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/user/email/check?email=${encodeURIComponent(email)}`)
}

/** 发送邮箱验证码 */
export async function sendEmailCaptcha(email: string, intent = 'register'): Promise<ApiResponse<unknown>> {
  return api.postSkipAuth<unknown>('/user/send/email/captcha', { email, intent })
}

/** 发送短信验证码 */
export async function sendSmsCaptcha(
  cellphone: string,
  countryTelephoneCode: string,
  intent = 'register'
): Promise<ApiResponse<unknown>> {
  return api.postSkipAuth<unknown>('/user/send/sms/captcha', {
    cellphone,
    countryTelephoneCode,
    intent,
  })
}

// ═══════════════════════════════════════════════════════
// 退出登录
// ═══════════════════════════════════════════════════════

/** 退出登录 */
export async function logout(): Promise<void> {
  try {
    const token = tokenStore.get()
    const userIdStr = localStorage.getItem('iot_user_id')
    if (token && userIdStr) {
      await api.post('/login/logout', {
        accessToken: token,
        userId: Number(userIdStr),
      })
    }
  } catch {
    // 忽略退出错误
  } finally {
    tokenStore.clear()
    localStorage.removeItem('iot_user_id')
  }
}

// ═══════════════════════════════════════════════════════
// Token 刷新
// ═══════════════════════════════════════════════════════

/** 刷新 Access Token */
export async function refreshAccessToken(): Promise<ApiResponse<LoginData>> {
  const accessToken = tokenStore.get()
  const refreshToken = tokenStore.getRefresh()
  if (!accessToken || !refreshToken) {
    return { code: -1, message: 'No token available for refresh', data: undefined }
  }
  const result = await api.postSkipAuth<LoginData>('/login/refresh/access/token', {
    accessToken,
    refreshToken,
  })
  if (result.data?.accessToken) {
    tokenStore.set(result.data.accessToken)
  }
  if (result.data?.refreshToken) {
    tokenStore.setRefresh(result.data.refreshToken)
  }
  return result
}

// ═══════════════════════════════════════════════════════
// 用户信息
// ═══════════════════════════════════════════════════════

/** 获取个人用户信息 */
export async function fetchUserInfo(): Promise<ApiResponse<UserInfo>> {
  return api.post<UserInfo>('/user/select/iotUserInfo')
}

/** 更新个人用户信息 */
export async function updateUserInfo(data: Partial<UserInfo>): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/user/update/iotUserInfo', data)
}

/** 修改密码 */
export async function updatePassword(
  oldPlainPassword: string,
  newPlainPassword: string
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/user/update/authPassword', {
    oldPassword: md5Password(oldPlainPassword),
    newPassword: md5Password(newPlainPassword),
  })
}

/** 找回密码 */
export async function resetPassword(
  account: string,
  newPlainPassword: string,
  captcha?: string
): Promise<ApiResponse<unknown>> {
  return api.postSkipAuth<unknown>('/user/reset/password', {
    account,
    newPassword: md5Password(newPlainPassword),
    captcha,
  })
}

/** 注销账户 */
export async function deleteAccount(): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/user/logout/account')
}

// ═══════════════════════════════════════════════════════
// 登录状态判断
// ═══════════════════════════════════════════════════════

/** 是否已登录 */
export function isLoggedIn(): boolean {
  return !!tokenStore.get()
}
