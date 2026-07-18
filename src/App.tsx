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
import SmartSchedulePage from './pages/SmartSchedulePage'
import NotificationsPage from './pages/NotificationsPage'
import OnboardingPage from './pages/OnboardingPage'
import DeviceMonitorPage from './pages/DeviceMonitorPage'
import DeviceDetailPage from './pages/DeviceDetailPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import BleDebugPage from './pages/BleDebugPage'
import PassthroughPage from './pages/PassthroughPage'
import DebugParamsPage from './pages/DebugParamsPage'
import DataExportPage from './pages/DataExportPage'
import { useRealtimeSimulator } from './hooks/useRealtimeSimulator'
import { DEV_TOOLS_ENABLED } from './config/devTools'
import { useLowBatteryMonitor } from './hooks/useLowBatteryMonitor'
import { useAuthStore } from './stores/authStore'
import { usePowerStationStore } from './stores/powerStationStore'
import { syncWebPushSubscription, refreshNotificationPermission } from './utils/pushNotification'
import { PUSH_ENABLED } from './config/webPush'
import { initNativePush } from './utils/nativePush'
import { Capacitor } from '@capacitor/core'
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
        <div className="w-16 h-16 rounded-l bg-[rgba(1,214,190,0.12)] border border-[rgba(1,214,190,0.3)]
          flex items-center justify-center">
          <Zap size={32} className="text-[#01D6BE]" aria-hidden="true" />
        </div>
        <Loader2 size={20} className="animate-spin text-[#01D6BE]" aria-hidden="true" />
        <p className="text-body-md text-[#BFBFBF]">Restoring session...</p>
      </div>
    </div>
  )
}

function AppInner() {
  const location = useLocation()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isGuest = useAuthStore(s => s.isGuest)
  const sessionReady = useAuthStore(s => s.sessionReady)
  const restoreSession = useAuthStore(s => s.restoreSession)
  useRealtimeSimulator()
  // 全局低电量监控：不依赖具体页面，App 存活即轮询所有设备并推送系统通知
  useLowBatteryMonitor()

  // 启动时恢复会话 + 刷新原生通知权限缓存
  useEffect(() => {
    restoreSession()
    refreshNotificationPermission()
  }, [restoreSession])

  // 登录后幂等同步 Web Push 订阅（覆盖订阅过期 / 换设备登录；已开启推送才执行）
  useEffect(() => {
    if (!isAuthenticated) return
    // 推送总开关关闭时完全不接线推送（不申请权限、不初始化 APNs/FCM）
    if (!PUSH_ENABLED) return
    // 原生平台先刷新通知权限缓存（getNotificationPermission 同步依赖它）
    refreshNotificationPermission()
    const s = usePowerStationStore.getState().settings
    const anyPushEnabled =
      !!s.pushNotifications || !!s.pushLowBattery || !!s.pushSolarStatus
    syncWebPushSubscription(anyPushEnabled)
    // 原生平台：登录后接线 APNs/FCM 推送并上报 token
    if (Capacitor.isNativePlatform() && anyPushEnabled) initNativePush()
  }, [isAuthenticated])

  // 等待会话恢复完成
  if (!sessionReady) {
    return <SessionLoadingScreen />
  }

  // 登录/注册页单独渲染，不包含底部导航
  if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/forgot-password') {
    return (
      <AnimatePresence mode="wait" initial={false}>
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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    )
  }

  // 除登录类页面外的所有路由统一在同一个 AnimatePresence + Routes 中渲染，
  // 保证跨页面（如 Overview ↔ Device 列表）切换走同一套过渡动画、不闪烁。
  // 底部导航仅在主标签页（/devices、/insights、/setting）显示。
  const showBottomNav =
    location.pathname === '/devices' ||
    location.pathname === '/insights' ||
    location.pathname === '/setting'

  return (
    <div className="h-full w-full bg-bg-base flex flex-col overflow-hidden">
      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="h-full w-full"
          >
            <Routes location={location}>
              {/* 带底部导航的主标签页 */}
              <Route path="/devices" element={<RequireAuth><DevicePage /></RequireAuth>} />
              <Route path="/insights" element={<RequireAuth><StatsPage /></RequireAuth>} />
              <Route path="/setting" element={<RequireAuth><SettingPage /></RequireAuth>} />
              {/* 二级页面（无底部导航） */}
              <Route path="/device/:id" element={<RequireAuth><DeviceMonitorPage /></RequireAuth>} />
              <Route path="/device/:id/settings" element={<RequireAuth><DeviceDetailPage /></RequireAuth>} />
              <Route path="/device/:id/dashboard" element={<RequireAuth><OverviewPage /></RequireAuth>} />
              {DEV_TOOLS_ENABLED && (
                <Route path="/device/:id/passthrough" element={<RequireAuth><PassthroughPage /></RequireAuth>} />
              )}
              {DEV_TOOLS_ENABLED && (
                <Route path="/device/:id/debug-params" element={<RequireAuth><DebugParamsPage /></RequireAuth>} />
              )}
              <Route path="/smart-schedule" element={<RequireAuth><SmartSchedulePage /></RequireAuth>} />
              <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
              <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
              {DEV_TOOLS_ENABLED && (
                <Route path="/ble-debug" element={<RequireAuth><BleDebugPage /></RequireAuth>} />
              )}
              <Route path="/data-export" element={<RequireAuth><DataExportPage /></RequireAuth>} />
              {/* 首次进入默认登录页，已登录/游客模式则进入 devices */}
              <Route
                path="/"
                element={<Navigate to={isAuthenticated || isGuest ? '/devices' : '/login'} replace />}
              />
              {/* 旧路由重定向到新路由（向后兼容） */}
              <Route path="/stats" element={<Navigate to="/insights" replace />} />
              <Route path="/settings" element={<Navigate to="/setting" replace />} />
              {/* 未匹配路径重定向 */}
              <Route
                path="*"
                element={<Navigate to={isAuthenticated || isGuest ? '/devices' : '/login'} replace />}
              />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 底部导航 - 仅主标签页显示 */}
      {showBottomNav && <BottomNavigation />}
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
