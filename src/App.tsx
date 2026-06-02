import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import BottomNavigation from './components/BottomNavigation'
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
    <div className="min-h-screen bg-[#000000] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-[22px] bg-[rgba(13,148,136,0.12)] border border-[rgba(13,148,136,0.3)]
          flex items-center justify-center">
          <Zap size={32} className="text-[#0D9488]" />
        </div>
        <Loader2 size={20} className="animate-spin text-[#0D9488]" />
        <p className="text-[13px] text-[#8E8E93]">Restoring session...</p>
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

  // 启动时恢复会话
  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  // 等待会话恢复完成
  if (!sessionReady) {
    return <SessionLoadingScreen />
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
              element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
            />
            <Route
              path="/register"
              element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />}
            />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    )
  }

  // 设备详情页 & Smart Schedule 页单独渲染，不包含底部导航
  if (location.pathname.startsWith('/device/') || location.pathname === '/smart-schedule' || location.pathname === '/notifications') {
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
                <Route path="/device/:id" element={<RequireAuth><OverviewPage /></RequireAuth>} />
                <Route path="/smart-schedule" element={<RequireAuth><SmartSchedulePage /></RequireAuth>} />
                <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
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
              <Route path="/" element={<RequireAuth><DevicePage /></RequireAuth>} />
              <Route path="/stats" element={<RequireAuth><StatsPage /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><SettingPage /></RequireAuth>} />
              {/* 未匹配路径重定向 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 底部导航 */}
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
