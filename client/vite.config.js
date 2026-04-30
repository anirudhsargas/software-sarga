import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import { boneyardPlugin } from 'boneyard-js/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    boneyardPlugin(),
    VitePWA({
      registerType: 'prompt', // Don't force reloads, let user decide
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
            // Cache product hierarchy, branches, customers for instant load
            urlPattern: /\/api\/(product-hierarchy|branches|customers)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sarga-api-stable',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 }, // 1 day
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache product/category/staff/machines (less critical)
            urlPattern: /\/api\/(products|categories|staff|machines)/,
            handler: 'NetworkFirst',
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
      devOptions: {
        enabled: false, // Disable Service Worker in development to avoid HMR conflicts
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
    visualizer({ open: false, gzipSize: true, brotliSize: true }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core (loads first)
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('lucide-react')) {
            return 'vendor-ui';
          }
          // Heavy libraries → separate chunks (lazy-loaded)
          if (id.includes('jspdf')) {
            return 'pdf-export';
          }
          if (id.includes('react-easy-crop')) {
            return 'image-processing';
          }
          if (id.includes('html5-qrcode') || id.includes('jsqr')) {
            return 'qr-code';
          }
          if (id.includes('@dnd-kit')) {
            return 'dnd-kit';
          }
          if (id.includes('recharts')) {
            return 'charts';
          }
          if (id.includes('axios')) {
            return 'http';
          }
          if (id.includes('dompurify')) {
            return 'security';
          }
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    cssCodeSplit: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      format: {
        comments: false,
      },
    },
    sourcemap: false,
    // Increase chunk size limit to avoid many small chunks
    chunkSizeWarningLimit: 1000,
    // Emit module preload polyfill
    modulePreload: true,
    // Optimize chunk size
    target: 'esnext',
    // Enable CSS minification
    cssMinify: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path,
        secure: false,
      },
      '/uploads': {
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
