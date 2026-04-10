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
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'sw.js', 'icon-192x192.svg', 'icon-512x512.svg'],
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
  publicDir: 'public'
})
