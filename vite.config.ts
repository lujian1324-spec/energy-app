import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// GitHub Pages 部署时设置 VITE_BASE_PATH 环境变量
// 例如: VITE_BASE_PATH=/powerflow-app/
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Skip waiting immediately so new SW takes over without requiring a page reload
      injectRegister: 'auto',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // 把 Web Push 事件处理器导入到 Workbox 生成的 SW（registerServiceWorker
        // 注册的就是这个 SW，必须带 'push' 监听，服务端推送才能在关闭/锁屏时弹出）
        importScripts: ['sw-push.js'],
      },
      includeAssets: ['apple-touch-icon.png', 'sw-push.js', 'badge-96.png', 'icon-192x192.png', 'icon-512x512.png'],
      manifest: {
        name: 'Sierro App',
        short_name: 'Sierro',
        description: '智能储能设备管理应用',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        scope: base,
        start_url: base,
        // PNG icons: iOS ignores SVG home-screen icons and Android notification
        // icons must be raster — ship PNG so install + push render on both.
        icons: [
          { src: 'icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react'],
          state: ['zustand'],
        },
      },
    },
  },
  publicDir: 'public'
})
