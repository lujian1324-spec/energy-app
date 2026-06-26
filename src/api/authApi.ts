/**
 * Sierro Inc. - 认证与用户 API
 *
 * 账号登录:    POST /login/account
 * 邮箱验证码登录: POST /login/email
 * 短信验证码登录: POST /login/sms
 * 注册:        POST /user/register/email | /user/register/cellphone
 * 退出:        POST /login/logout
 * Token 刷新:  POST /login/refresh/access/token
 * 用户信息:    POST /user/select/iotUserInfo
 * 修改密码:    POST /user/update/authPassword
 * 找回密码:    POST /user/reset/password
 * 账号校验:    GET  /user/account/check
 * 邮箱校验:    GET  /user/email/check
 * 发送验证码:  POST /user/send/sms/captcha | /user/send/email/captcha
 *
 * 重要：密码需 MD5 加密后传输（平台要求，明文密码会返回 code 7）
 * 登录接口受签名拦截，但不需 IOT-Token（使用 postSkipAuth）
 * 验证码发送字段名为 address（非 email）
 * 验证码响应字段为 iotCaptchaId（非 captchaId）
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
  countryTelephoneCode?: string  // 手机区号，如 "1"（不带 +）
  verifyCode?: string   // 验证码（API 字段名，非 captcha）
  captchaId?: string    // 验证码会话ID
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
  intent?: string  // 用途：数值字符串 "1"=注册 "2"=重置密码 "3"=登录
}

/** 发送验证码响应 */
export interface SendCaptchaResponse {
  iotCaptchaId?: string  // 验证码会话ID（API 返回字段名，非 captchaId）
  [key: string]: unknown
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

/** 邮箱验证码登录（无密码） */
export async function loginByEmail(
  email: string,
  iotCaptchaId: string,
  verifyCode: string
): Promise<ApiResponse<LoginData>> {
  const result = await api.postSkipAuth<LoginData>('/login/email', {
    email,
    captchaId: iotCaptchaId,
    verifyCode,
  })
  if ((result.code === 0 || result.code === '0') && result.data) {
    const accessToken = result.data.accessToken
    if (accessToken) tokenStore.set(accessToken)
    const refreshToken = result.data.refreshToken
    if (refreshToken) tokenStore.setRefresh(refreshToken)
  }
  return result
}

/** 短信验证码登录（无密码） */
export async function loginBySms(
  cellphone: string,
  countryTelephoneCode: string,
  iotCaptchaId: string,
  verifyCode: string
): Promise<ApiResponse<LoginData>> {
  const normalizedCode = countryTelephoneCode.replace(/^\+/, '')
  const result = await api.postSkipAuth<LoginData>('/login/sms', {
    cellphone,
    countryTelephoneCode: normalizedCode,
    captchaId: iotCaptchaId,
    verifyCode,
  })
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
  verifyCode?: string,
  captchaId?: string
): Promise<ApiResponse<unknown>> {
  return api.postSkipAuth<unknown>('/user/register/email', {
    account,
    password: md5Password(plainPassword),
    email,
    verifyCode,
    captchaId,
  })
}

/** 手机注册 */
export async function registerByCellphone(
  account: string,
  plainPassword: string,
  cellphone: string,
  countryTelephoneCode: string,
  verifyCode?: string,
  captchaId?: string
): Promise<ApiResponse<unknown>> {
  // API 要求区号不带 "+" 前缀 (如 "86" 而非 "+86")
  const normalizedCode = countryTelephoneCode.replace(/^\+/, '')
  return api.postSkipAuth<unknown>('/user/register/cellphone', {
    account,
    password: md5Password(plainPassword),
    cellphone,
    countryTelephoneCode: normalizedCode,
    verifyCode,
    captchaId,
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

/** 发送邮箱验证码 — 返回 iotCaptchaId */
export async function sendEmailCaptcha(email: string, intent = '1'): Promise<ApiResponse<SendCaptchaResponse>> {
  // API 字段名是 address（非 email）
  return api.postSkipAuth<SendCaptchaResponse>('/user/send/email/captcha', { address: email, intent })
}

/** 发送短信验证码 — 返回 iotCaptchaId */
export async function sendSmsCaptcha(
  cellphone: string,
  countryTelephoneCode: string,
  intent = '1'
): Promise<ApiResponse<SendCaptchaResponse>> {
  const normalizedCode = countryTelephoneCode.replace(/^\+/, '')
  return api.postSkipAuth<SendCaptchaResponse>('/user/send/sms/captcha', {
    cellphone,
    countryTelephoneCode: normalizedCode,
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

/**
 * 更新个人用户信息（如昵称/头像）。
 *
 * 后端通过 IOT-Token 请求头识别当前用户，请求体只需带要更新的字段。
 * 不要传字符串形式的 userId：iotUserInfo 接口把 userId 绑定为 Java Long，
 * 传入字符串会触发 "illegal argument"。这里直接剔除 userId，由 token 识别用户。
 */
export async function updateUserInfo(data: Partial<UserInfo>): Promise<ApiResponse<unknown>> {
  const { userId: _userId, ...payload } = data
  return api.post<unknown>('/user/update/iotUserInfo', payload)
}

/** 更新用户邮箱（需先通过 sendEmailCaptcha 获取 iotCaptchaId） */
export async function updateUserEmail(
  email: string,
  iotCaptchaId: string,
  verifyCode: string
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/user/update/iotUserEmail', {
    email,
    captchaId: iotCaptchaId,
    verifyCode,
  })
}

/** 发送手机验证码用于修改手机号 */
export async function sendCellphoneUpdateVerify(
  cellphone: string
): Promise<ApiResponse<SendCaptchaResponse>> {
  return api.post<SendCaptchaResponse>('/user/update/cellphoneVerify', { cellphone })
}

/** 修改手机号 */
export async function updateUserCellphone(
  cellphone: string,
  iotCaptchaId: string,
  verifyCode: string
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/user/update/iotUserCellphone', {
    cellphone,
    captchaId: iotCaptchaId,
    verifyCode,
  })
}

/**
 * 修改密码（均需 MD5 加密）。
 *
 * 后端通过 IOT-Token 请求头识别当前用户，请求体只接受 oldPassword / newPassword。
 * 不要再传 userId：authPassword 接口会把 userId 绑定为 Java Long，传入字符串形式
 * 的 userId 会触发 "illegal argument"。第三个参数保留仅为向后兼容，已不再使用。
 */
export async function updatePassword(
  oldPlainPassword: string,
  newPlainPassword: string,
  _userId?: number | string
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
  verifyCode?: string,
  captchaId?: string,
  email?: string
): Promise<ApiResponse<unknown>> {
  return api.postSkipAuth<unknown>('/user/reset/password', {
    ...(account ? { account } : {}),
    newPassword: md5Password(newPlainPassword),
    verifyCode,
    captchaId,
    ...(email ? { email } : {}),
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

/**
 * 验证当前会话是否有效（轻量级检查）
 * - 调用 fetchUserInfo 验证 token 是否过期
 * - 用于 App 启动时静默恢复会话
 */
export async function verifySession(): Promise<boolean> {
  try {
    const result = await fetchUserInfo()
    return result.code === 0 || result.code === '0'
  } catch {
    return false
  }
}
