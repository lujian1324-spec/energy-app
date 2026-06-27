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
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'sw-push.js', 'icon-192x192.svg', 'icon-512x512.svg'],
      manifest: {
        name: 'Sierro App',
        short_name: 'Sierro',
        description: '智能储能设备管理应用',
        theme_color: '#000000',
        background_color: '#FFFFFF',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
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
