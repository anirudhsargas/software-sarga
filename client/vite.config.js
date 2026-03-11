import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'icons/*.png'],
      manifest: false, // we already have public/manifest.json
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Cache JS, CSS, HTML, images, fonts
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        // Runtime caching for the API
        runtimeCaching: [
          {
            // Cache product hierarchy, categories, staff — data that rarely changes
            urlPattern: /\/api\/(product-hierarchy|products|categories|branches|staff|machines)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sarga-api-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 4 }, // 4 hours
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Don't precache index.html with hash — let it always go network-first
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^(?!\/__).*/],
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path,
        secure: false,
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
