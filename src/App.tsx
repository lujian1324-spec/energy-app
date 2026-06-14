import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import BottomNavigation from './components/BottomNavigation'
import PermissionsGate, { hasAskedPermissions } from './components/PermissionsGate'
import DevicePage from './pages/DevicePage'
import OverviewPage from './pages/OverviewPage'
import StatsPage from './pages/StatsPage'
import SettingPage from './pages/SettingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import SmartSchedulePage from './pages/SmartSchedulePage'
import NotificationsPage from './pages/NotificationsPage'
import OnboardingPage from './pages/OnboardingPage'
import DeviceMonitorPage from './pages/DeviceMonitorPage'
import DeviceDetailPage from './pages/DeviceDetailPage'
import { useRealtimeSimulator } from './hooks/useRealtimeSimulator'
import { useAuthStore } from './stores/authStore'
import { ToastContainer, useToast } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Zap, Loader2 } from 'lucide-react'

/** 路由守卫：未登录且非游客则跳转到 /login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isGuest = useAuthStore(s => s.isGuest)
  if (!isAuthenticated && !isGuest) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

/** Session 恢复中的全屏加载画面 */
function SessionLoadingScreen() {
  const timeoutRef = useRef(false)

  useEffect(() => {
    // 10 秒超时兜底：避免网络故障时用户被卡在加载屏
    const timer = setTimeout(() => {
      timeoutRef.current = true
      useAuthStore.getState().restoreSession()
    }, 10000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-[22px] bg-[rgba(1,214,190,0.12)] border border-[rgba(1,214,190,0.3)]
          flex items-center justify-center">
          <Zap size={32} className="text-[#01D6BE]" aria-hidden="true" />
        </div>
        <Loader2 size={20} className="animate-spin text-[#01D6BE]" aria-hidden="true" />
        <p className="text-[13px] text-[#A0A0A5]">Restoring session...</p>
      </div>
    </div>
  )
}

function AppInner() {
  const location = useLocation()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const sessionReady = useAuthStore(s => s.sessionReady)
  const restoreSession = useAuthStore(s => s.restoreSession)
  useRealtimeSimulator()

  // 首次启动权限引导：session 恢复完成后检查
  const [permissionsDone, setPermissionsDone] = useState(hasAskedPermissions)

  // 启动时恢复会话
  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  // 等待会话恢复完成
  if (!sessionReady) {
    return <SessionLoadingScreen />
  }

  // 首次启动 → 显示权限引导页
  if (!permissionsDone) {
    return <PermissionsGate onDone={() => setPermissionsDone(true)} />
  }

  // 登录/注册页单独渲染，不包含底部导航
  if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/terms' || location.pathname === '/privacy') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="h-full w-full"
        >
          <Routes location={location}>
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/devices" replace /> : <LoginPage />}
            />
            <Route
              path="/register"
              element={isAuthenticated ? <Navigate to="/devices" replace /> : <RegisterPage />}
            />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    )
  }

  // 设备详情页 & Smart Schedule 页 & 通知页单独渲染，不包含底部导航
  // 注意：/devices（设备列表，带底部导航）不在此分支，故用 '/device/' 前缀匹配
  if (location.pathname.startsWith('/device/') || location.pathname === '/smart-schedule' || location.pathname === '/notifications' || location.pathname === '/onboarding' || location.pathname.startsWith('/profile')) {
    return (
      <div className="h-full w-full bg-bg-base flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="h-full w-full"
            >
              <Routes location={location}>
                <Route path="/device/:id" element={<RequireAuth><DeviceMonitorPage /></RequireAuth>} />
                <Route path="/device/:id/settings" element={<RequireAuth><DeviceDetailPage /></RequireAuth>} />
                <Route path="/device/:id/dashboard" element={<RequireAuth><OverviewPage /></RequireAuth>} />
                <Route path="/smart-schedule" element={<RequireAuth><SmartSchedulePage /></RequireAuth>} />
                <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
                <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-bg-base flex flex-col overflow-hidden">
      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="h-full w-full"
          >
            <Routes location={location}>
              {/* PRD v1.1 新路由 */}
              <Route path="/devices" element={<RequireAuth><DevicePage /></RequireAuth>} />
              <Route path="/insights" element={<RequireAuth><StatsPage /></RequireAuth>} />
              <Route path="/setting" element={<RequireAuth><SettingPage /></RequireAuth>} />
              {/* 默认进入 devices */}
              <Route path="/" element={<Navigate to="/devices" replace />} />
              {/* 旧路由重定向到新路由（向后兼容） */}
              <Route path="/stats" element={<Navigate to="/insights" replace />} />
              <Route path="/settings" element={<Navigate to="/setting" replace />} />
              {/* 未匹配路径重定向 */}
              <Route path="*" element={<Navigate to="/devices" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 底部导航 - PRD v1.1 大写标签 + 48×48dp 触控热区 */}
      <BottomNavigation />
    </div>
  )
}

/**
 * App 根组件：在最外层挂载全局 Toast 容器
 * 确保所有路由（登录页、设备详情页、主页）均可触发 toast 通知
 */
function App() {
  const { toasts, dismiss } = useToast()

  return (
    <ErrorBoundary>
      {/* 全局 Toast 通知层 — 覆盖所有路由，z-index: 200 */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <AppInner />
    </ErrorBoundary>
  )
}

export default App
