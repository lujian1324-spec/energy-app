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
import { api, tokenStore, isApiSuccess, ApiResponse } from '../utils/apiClient'

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
  email?: string
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
  name?: string         // 显示名（后端字段是 name，不是 nickname）
}

/**
 * 用户信息 — /user/select/iotUserInfo 的实测字段。
 *
 * The display name is `name`. It is NOT `nickname`: that field does not exist on
 * this object and `/user/update/iotUserInfo` rejects it with 20101 "illegal
 * argument", which is what every rename has failed with. Probed against the live
 * backend — {name} is the only body it accepts.
 */
export interface UserInfo {
  /** 大整数，后端以字符串下发（例："491513787113766912"） */
  userId?: number | string
  /** 主键，同样是字符串大整数 */
  id?: string
  uid?: string
  account?: string
  /** 显示名。改名走 updateUserInfo({ name })。 */
  name?: string
  /** ISO 时间；账号创建时刻。 */
  createdAt?: string
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
  intent?: string  // 1=register 2=reset 6=email-login 5=sms-login 4=update-email (number on wire)
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

/** 规范化国家区号：平台要求不带 "+" 前缀（如 "1" 而非 "+1"）。所有发送区号处统一调用。 */
export function normalizeCountryCode(code: string): string {
  return code.replace(/^\+/, '')
}

/**
 * 验证码用途（intent）枚举。
 *
 * The values are strings because everything here compares them as strings, but
 * they go up the wire as NUMBERS — see sendEmailCaptcha. Both API documents type
 * this field `integer`, and the published request example carries `"intent": 1`.
 */
export const CaptchaIntent = {
  REGISTER: '1',
  RESET_PASSWORD: '2',
  /** Email sign-in. Official web login uses 6; 3 is NOT login. */
  LOGIN: '6',
  /** Official web SMS login uses 5. */
  SMS_LOGIN: '5',
  UPDATE_EMAIL: '4',
} as const

// ═══════════════════════════════════════════════════════
// 登录
// ═══════════════════════════════════════════════════════

/**
 * 服务端 poller 用的「专属会话」refreshToken 的暂存键。
 *
 * 实测平台特性:refreshToken 单次使用(用一次即轮换、旧的立即失效),但【同账号
 * 可并存多条互相独立的会话】。所以不能把 App 自己会话的 refreshToken 交给 poller
 * ——那会和 App 抢同一条会话、一刷新就把 App 踢下线。正解是登录时(手上有密码)
 * 额外再登一次,生成一条【专供 poller 的独立会话】,把它的 refreshToken 作为
 * 一次性 bootstrap 暂存于此,首次推送订阅时上报给 relay;之后由 poller 独占轮换,
 * App 侧永不再动它。仅密码登录可用(邮箱/短信验证码登录无密码,无法再登一次)。
 */
export const POLLER_REFRESH_PENDING_KEY = 'iot_poller_refresh_pending'

/** 铸造一条专供 poller 的独立会话并暂存其令牌(best-effort,失败静默)。 */
async function provisionPollerSession(username: string, plainPassword: string): Promise<void> {
  try {
    // 独立再登一次,拿到一条与 App 自己会话互不影响的新会话;不写 tokenStore。
    const res = await api.postSkipAuth<LoginData>('/login/account', {
      account: username,
      password: md5Password(plainPassword),
    })
    // 存【access + refresh 成对】:平台刷新接口要求成对提交,poller 起步先直接用
    // accessToken(约 2h),临期才用这对去刷新。附上 access 过期时刻供 poller 判断。
    if (isApiSuccess(res.code) && res.data?.accessToken && res.data?.refreshToken) {
      localStorage.setItem(POLLER_REFRESH_PENDING_KEY, JSON.stringify({
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        // Coerce to Number FIRST: the backend often returns this as a string, and
        // `Date.now() + "7199991"` would string-concat into a bogus 20-digit value
        // (e.g. "17852537909297199991"), which the poller reads as "expires far in
        // the future" → it never refreshes → permanent "Token expired".
        accessExpiresAt: Date.now() + (Number(res.data.accessTokenWillExpiredInMillis) || 2 * 60 * 60 * 1000),
      }))
    }
  } catch {
    /* poller 仅在下次登录时再尝试补铸;不影响正常登录 */
  }
}

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
  if (isApiSuccess(result.code) && result.data) {
    const accessToken = result.data.accessToken
    if (accessToken) tokenStore.set(accessToken)
    const refreshToken = result.data.refreshToken
    if (refreshToken) tokenStore.setRefresh(refreshToken)
    // 顺手为服务端 poller 铸造一条独立会话(fire-and-forget)。
    void provisionPollerSession(username, plainPassword)
  }

  return result
}

/**
 * Password this app gives an account it registers itself: the account plus 1234.
 * Kept here as well as in LoginPage so a code sign-in can re-derive it — see
 * loginByEmail below.
 */
export function defaultPasswordForAccount(account: string): string {
  return `${account}1234`
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
  if (isApiSuccess(result.code) && result.data) {
    const accessToken = result.data.accessToken
    if (accessToken) tokenStore.set(accessToken)
    const refreshToken = result.data.refreshToken
    if (refreshToken) tokenStore.setRefresh(refreshToken)
    /**
     * Mint the relay's own session here too. provisionPollerSession needs a
     * password and this flow has none, so only a brand-new registration — which
     * signs in with the password it just generated — ever seeded one. Everyone
     * signing back in with a code got a push token the relay could register but
     * no session to poll their devices with, which is why Power Outage and Low
     * Battery never fired once the app was closed.
     *
     * The account the app registers carries a password derived from its own
     * name, and the login response tells us that name, so it can be re-derived.
     * An account created elsewhere, or one whose password was changed, simply
     * fails this extra login the way it already did — silently, no regression.
     */
    const account = typeof result.data.account === 'string' ? result.data.account : ''
    if (account) void provisionPollerSession(account, defaultPasswordForAccount(account))
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
  const normalizedCode = normalizeCountryCode(countryTelephoneCode)
  const result = await api.postSkipAuth<LoginData>('/login/sms', {
    cellphone,
    countryTelephoneCode: normalizedCode,
    captchaId: iotCaptchaId,
    verifyCode,
  })
  if (isApiSuccess(result.code) && result.data) {
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
  const normalizedCode = normalizeCountryCode(countryTelephoneCode)
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

/**
 * 发送邮箱验证码 — 返回 iotCaptchaId
 *
 * `intent` goes as a NUMBER. Both API documents type it `integer` and the
 * published example carries `"intent": 1`; this sent the string "3" for a
 * sign-in code, and a backend that cannot parse that falls back to its default —
 * which is 1, register. That is what put a "Register account" email in front of
 * accounts that already existed while the same request made by hand, with a real
 * integer, came back titled "login".
 */
export async function sendEmailCaptcha(email: string, intent = '1'): Promise<ApiResponse<SendCaptchaResponse>> {
  // API 字段名是 address（非 email）
  return api.postSkipAuth<SendCaptchaResponse>('/user/send/email/captcha', {
    address: email,
    intent: Number(intent),
  })
}

/** 发送短信验证码 — 返回 iotCaptchaId */
export async function sendSmsCaptcha(
  cellphone: string,
  countryTelephoneCode: string,
  intent = '1'
): Promise<ApiResponse<SendCaptchaResponse>> {
  const normalizedCode = normalizeCountryCode(countryTelephoneCode)
  return api.postSkipAuth<SendCaptchaResponse>('/user/send/sms/captcha', {
    cellphone,
    countryTelephoneCode: normalizedCode,
    // A number here too, for the same reason as the email one.
    intent: Number(intent),
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
      // As a String. This was Number(userIdStr), and a real userId is an 18-digit
      // platform id — 491513787113766912 comes back 491513787113766900, a
      // different account. logout swallows its errors, so it never showed.
      await api.post('/login/logout', {
        accessToken: token,
        userId: userIdStr,
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
 * 更新个人用户信息。
 *
 * 后端通过 IOT-Token 请求头识别当前用户，请求体只需带要更新的字段。
 *
 * The display-name field is `name`. Renaming was sent as `nickname` from the
 * first wiring and always came back 20101 "illegal argument"; two attempted
 * fixes moved `userId` around instead, which was never the problem. Probed
 * against the live backend: {name} → code 0, while {nickname}, {userName},
 * {realName} and every userId variant → 20101. `userId` is still stripped —
 * the token identifies the user and the id is a string big-integer.
 */
export async function updateUserInfo(data: Partial<UserInfo>): Promise<ApiResponse<unknown>> {
  const { userId: _userId, ...payload } = data
  return api.post<unknown>('/user/update/iotUserInfo', payload)
}

/**
 * 更新用户邮箱（需先通过 sendEmailCaptcha 获取 iotCaptchaId）。
 *
 * The code field is `emailVerifyCode`, not `verifyCode` — `UserUpdateByEmailDtio`
 * per the platform's own API mapping, and confirmed by probing: every shape
 * without it answered 20101 "illegal argument", the same error a wrong field name
 * gives on iotUserInfo. The login and register endpoints do use plain
 * `verifyCode`; the update endpoints prefix it with the channel.
 */
export async function updateUserEmail(
  email: string,
  iotCaptchaId: string,
  verifyCode: string
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/user/update/iotUserEmail', {
    email,
    captchaId: iotCaptchaId,
    emailVerifyCode: verifyCode,
  })
}

/**
 * 验证手机号修改（UpdateTelephoneVerifyDtio）。Not wired to any screen yet.
 * The platform's mapping shows this takes { captchaId, smsVerifyCode } — it
 * *verifies* a code rather than sending one; the code comes from sendSmsCaptcha.
 */
export async function verifyCellphoneUpdate(
  iotCaptchaId: string,
  smsVerifyCode: string
): Promise<ApiResponse<SendCaptchaResponse>> {
  return api.post<SendCaptchaResponse>('/user/update/cellphoneVerify', {
    captchaId: iotCaptchaId,
    smsVerifyCode,
  })
}

/**
 * 修改手机号（UpdateTelephoneDtio）。Not wired to any screen yet.
 * Like the email one, the code field carries its channel: `smsVerifyCode`.
 */
export async function updateUserCellphone(
  cellphone: string,
  iotCaptchaId: string,
  smsVerifyCode: string,
  countryTelephoneCode?: string
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/user/update/iotUserCellphone', {
    cellphone,
    ...(countryTelephoneCode ? { countryTelephoneCode: normalizeCountryCode(countryTelephoneCode) } : {}),
    captchaId: iotCaptchaId,
    smsVerifyCode,
  })
}

/**
 * 修改密码（均需 MD5 加密）。
 *
 * NOT wired to any screen — Change Password was removed from Profile in 4.7.75.
 *
 * The body below is almost certainly wrong and will answer 20101 if it is ever
 * called again: the platform's mapping gives UserUpdatePasswordDtio as
 * { authId, originalPassword, newPassword, confirmPassword, userId } — so the
 * field is `originalPassword`, and `confirmPassword` and `authId` (which the
 * login response returns) are both required. Left as-is rather than half-fixed;
 * whoever wires the screen back up should send that shape and probe it.
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
    return isApiSuccess(result.code)
  } catch {
    return false
  }
}
