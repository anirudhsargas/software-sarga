import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import { boneyardPlugin } from 'boneyard-js/vite'
import sitemap from 'vite-plugin-sitemap'

const publicRoutes = ['/', '/services', '/products', '/design', '/track', '/contact', '/signin', '/privacy', '/terms'];

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    boneyardPlugin(),
    sitemap({
      hostname: 'https://sargaoffset.vercel.app',
      outDir: 'dist',
      dynamicRoutes: publicRoutes,
      generateRobotsTxt: false,
      exclude: [
        '/dashboard/**',
        '/login',
        '/forgot-password',
        '/reset-password',
        '/change-password',
        '/staff-settings',
        '/accounting/**',
        '/staff/**',
        '/designer/**',
        '/error/**',
      ],
    }),
    VitePWA({
      registerType: 'prompt', // Prompt the user before updating
      includeAssets: ['favicon.png', 'icons/*.png', 'icons/*.webp', 'icons/*.avif', 'assets/**/*'],
      manifest: false, // we already have public/manifest.json
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit for caching
        // Cache JS, CSS, HTML, images, fonts
        globPatterns: ['**/*.{js,css,html,png,webp,avif,svg,ico,woff2,json}'],
        // Runtime caching for the API
        runtimeCaching: [
          {
            // Cache product hierarchy, branches, customers for instant load
            urlPattern: /\/api\/(product-hierarchy|branches|customers|company-settings)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sarga-api-stable',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 1 week
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache products/categories/staff/machines (active data)
            urlPattern: /\/api\/(products|categories|staff|machines)/,
            handler: 'NetworkFirst',
            options: {
              networkTimeoutSeconds: 5, // Fallback to cache after 5s
              cacheName: 'sarga-api-data',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }, // 1 day
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache images from the server/cloudinary
            urlPattern: /\/uploads\/|res\.cloudinary\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sarga-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
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
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3')) {
              return 'charts';
            }
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('jspdf-autotable')) {
              return 'pdf';
            }
            if (id.includes('excel') || id.includes('xlsx') || id.includes('boneyard-js')) {
              return 'excel';
            }
            return 'vendor';
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
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3000',
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
