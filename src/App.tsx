import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import BottomNavigation from './components/BottomNavigation'
import DevicePage from './pages/DevicePage'
import OverviewPage from './pages/OverviewPage'
import StatsPage from './pages/StatsPage'
import SettingPage from './pages/SettingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SmartSchedulePage from './pages/SmartSchedulePage'
import { useRealtimeSimulator } from './hooks/useRealtimeSimulator'
import { useAuthStore } from './stores/authStore'
import { ToastContainer, useToast } from './components/Toast'

/** 路由守卫：未登录跳转到 /login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function App() {
  const location = useLocation()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const { toasts, dismiss } = useToast()
  useRealtimeSimulator()

  // 登录/注册页单独渲染，不包含底部导航
  if (location.pathname === '/login' || location.pathname === '/register') {
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
          </Routes>
        </motion.div>
      </AnimatePresence>
    )
  }

  // 设备详情页 & Smart Schedule 页单独渲染，不包含底部导航
  if (location.pathname.startsWith('/device/') || location.pathname === '/smart-schedule') {
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
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-bg-base flex flex-col overflow-hidden">
      {/* Toast 全局通知层 */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
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

export default App
