import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Auto-reload page when a new service worker activates.
// Prevents blank-page from stale SW serving old (now-deleted) JS chunk hashes.
registerSW({
  onNeedRefresh() {
    window.location.reload()
  },
  onOfflineReady() {},
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
