import { Routes, Route } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import BottomNavigation from './components/BottomNavigation'
import OverviewPage from './pages/OverviewPage'
import StatsPage from './pages/StatsPage'
import SettingPage from './pages/SettingPage'
import DevicePage from './pages/DevicePage'
import PeakShavingPage from './pages/PeakShavingPage'
import { useRealtimeSimulator } from './hooks/useRealtimeSimulator'

function App() {
  const location = useLocation()
  useRealtimeSimulator()

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
            <Route path="/" element={<OverviewPage />} />
            <Route path="/devices" element={<DevicePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/peak-shaving" element={<PeakShavingPage />} />
            <Route path="/settings" element={<SettingPage />} />
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
