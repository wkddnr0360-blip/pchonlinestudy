import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.PAGES_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: base,
        name: '박철한 온스',
        short_name: '박철한 온스',
        lang: 'ko',
        display: 'standalone',
        background_color: '#f8f9fc',
        theme_color: '#f8f9fc',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/ons-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/ons-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/ons-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,svg,png,webp,woff2}', 'book/manifest.json'],
        navigateFallback: base + 'index.html',
        runtimeCaching: [{
          urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/book\/[a-f0-9]+\/[^/]+\.json$/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'police-ox-book', cacheableResponse: { statuses: [200] } },
        }],
      },
    }),
  ],
})
