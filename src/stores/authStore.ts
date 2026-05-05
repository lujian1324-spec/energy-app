/**
 * 认证状态管理
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { loginByAccount, logout, isLoggedIn, LoginData } from '../api/authApi'

interface AuthState {
  isAuthenticated: boolean
  user: LoginData | null
  loading: boolean
  error: string | null

  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: isLoggedIn(),
      user: null,
      loading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ loading: true, error: null })
        try {
          const result = await loginByAccount(username, password)

          // 平台返回码判断（兼容 code=200 / code='0' / code='success'）
          const ok =
            result.code === 200 ||
            result.code === '200' ||
            result.code === 0 ||
            result.code === '0' ||
            result.code === 'success'

          if (ok && result.data) {
            set({ isAuthenticated: true, user: result.data, loading: false, error: null })
            return true
          } else {
            const msg = result.message ?? result.msg ?? '登录失败，请检查账号密码'
            set({ loading: false, error: msg, isAuthenticated: false })
            return false
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : '网络错误，请稍后重试'
          set({ loading: false, error: msg, isAuthenticated: false })
          return false
        }
      },

      logout: async () => {
        await logout()
        set({ isAuthenticated: false, user: null, error: null })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'iot-auth',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    }
  )
)
