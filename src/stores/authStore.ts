/**
 * 认证状态管理
 * 真实 API 登录，userId 存入 localStorage 供退出接口使用
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  loginByAccount,
  logout as apiLogout,
  isLoggedIn,
  verifySession,
  refreshAccessToken,
  LoginData,
} from '../api/authApi'
import { tokenStore } from '../utils/apiClient'
import { useDeviceStore } from './deviceStore'
import { disableWebPush } from '../utils/pushNotification'

interface AuthState {
  isAuthenticated: boolean
  /** 游客模式：跳过登录直接浏览（功能受限） */
  isGuest: boolean
  user: LoginData | null
  loading: boolean
  error: string | null
  /** 会话恢复是否已完成（防止首次渲染闪烁） */
  sessionReady: boolean

  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
  /** 启动时静默恢复会话：验证 token → 必要时刷新 → 确定登录状态 */
  restoreSession: () => Promise<void>
  /** 进入游客模式（跳过 API 登录） */
  setGuestMode: () => void
}

/** 判断业务响应码是否成功 */
function isSuccess(code: number | string): boolean {
  return (
    code === 200 || code === '200' ||
    code === 0   || code === '0'   ||
    code === 'success'
  )
}


export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: isLoggedIn(),
      isGuest: false,
      user: null,
      loading: false,
      error: null,
      sessionReady: false,

      login: async (username: string, password: string) => {
        set({ loading: true, error: null })

        try {
          const result = await loginByAccount(username, password)

          if (isSuccess(result.code) && result.data) {
            // 存储 userId 供退出接口使用
            if (result.data.userId) {
              localStorage.setItem('iot_user_id', String(result.data.userId))
            }
            // 登录成功必须清除游客标记，否则会出现 isGuest && isAuthenticated
            // 同时为真，导致游客横幅残留、/login 路由被守卫弹回。
            set({ isAuthenticated: true, isGuest: false, user: result.data, loading: false, error: null })
            return true
          }

          // 业务失败：展示后端返回的错误信息
          const msg = result.message ?? result.msg ?? 'Login failed'
          set({ loading: false, error: msg, isAuthenticated: false })
          return false
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Network error — please try again'
          set({ loading: false, error: msg, isAuthenticated: false })
          return false
        }
      },

      logout: async () => {
        // 先注销 Web Push 订阅（需在 token 失效前调用后端），避免登出后仍收推送
        try { await disableWebPush() } catch { /* ignore */ }
        await apiLogout()
        // 清除 demo 模式
        useDeviceStore.getState().exitDemoMode()
        set({ isAuthenticated: false, isGuest: false, user: null, error: null, sessionReady: true })
      },

      clearError: () => set({ error: null }),

      setGuestMode: () => {
        set({ isGuest: true, isAuthenticated: false, sessionReady: true, error: null })
        // 加载 demo 设备数据
        useDeviceStore.getState().loadDemoDevices()
      },

      /**
       * 启动时静默恢复会话：
       * 1. 检查本地是否有 token
       * 2. 调用 fetchUserInfo 验证有效性
       * 3. 失败则刷新 token 后重试
       * 4. 全部失败则清除会话
       */
      restoreSession: async () => {
        const token = tokenStore.get()
        if (!token) {
          set({ isAuthenticated: false, sessionReady: true })
          return
        }

        // Step 1: 用现有 token 验证
        const valid = await verifySession()
        if (valid) {
          set({ isAuthenticated: true, isGuest: false, sessionReady: true })
          return
        }

        // Step 2: 尝试刷新 token
        const refreshResult = await refreshAccessToken()
        if (refreshResult.code === 0 || refreshResult.code === '0') {
          // 刷新成功，再验证一次
          const valid2 = await verifySession()
          if (valid2) {
            set({ isAuthenticated: true, isGuest: false, sessionReady: true })
            return
          }
        }

        // Step 3: 全部失败，清除会话
        tokenStore.clear()
        localStorage.removeItem('iot_user_id')
        set({ isAuthenticated: false, user: null, sessionReady: true })
      },
    }),
    {
      name: 'iot-auth',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        // 游客模式不持久化：关闭/重新打开 App 后必须回到登录页，而不是直接进入设备列表。
        user: state.user,
      }),
    }
  )
)

/**
 * 监听 apiClient 发出的 Token 刷新失败事件
 * Token 续期失败时自动清除本地登录状态
 */
if (typeof window !== 'undefined') {
  window.addEventListener('auth:expired', () => {
    const store = useAuthStore.getState()
    // 仅在已登录状态时处理
    if (store.isAuthenticated) {
      tokenStore.clear()
      localStorage.removeItem('iot_user_id')
      useAuthStore.setState({ isAuthenticated: false, user: null, sessionReady: true })
    }
  })
}
