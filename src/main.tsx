import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { setupNativeUx } from './utils/nativeUx'

// Auto-reload page when a new service worker activates.
// Prevents blank-page from stale SW serving old (now-deleted) JS chunk hashes.
registerSW({
  onNeedRefresh() {
    window.location.reload()
  },
  onOfflineReady() {},
})

// 原生壳 UX（状态栏/返回键/键盘）；Web 下为 no-op
setupNativeUx()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* reducedMotion="user" — 尊重系统「减少动态」无障碍设置：开启时 framer-motion
        自动降级所有 transform/layout 动画（保留 opacity），全域一处生效 */}
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <App />
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>,
)
