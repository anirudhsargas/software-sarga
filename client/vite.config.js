import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import { boneyardPlugin } from 'boneyard-js/vite'
import sitemap from 'vite-plugin-sitemap'

const publicRoutes = ['/', '/services', '/products', '/design', '/track', '/contact', '/signin', '/privacy', '/terms'];

// Prevent modulepreload for heavy on-demand vendor chunks so they don't add to initial transfer size
    const skipModulePreloadPlugin = () => ({
  name: 'skip-module-preload',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(
      /<link[^>]*rel="modulepreload"[^>]*href="[^"]*(?:charts-vendor|excel-vendor|form-vendor|sentry-vendor|tanstack-virtual-vendor|qr-vendor)[^"]*"[^>]*>/gi,
      ''
    ),
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  esbuild: {
    drop: ['console', 'debugger'],
  },
  plugins: [
    skipModulePreloadPlugin(),
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
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit for caching
        // Cache JS, CSS, HTML, images, fonts
        globPatterns: ['**/*.{js,css,html,png,webp,avif,svg,ico,woff2,json}'],
        globIgnores: [
          '**/charts-vendor-*.js',
          '**/excel-vendor-*.js',
          '**/form-vendor-*.js',
          '**/sentry-vendor-*.js',
          '**/tanstack-virtual-vendor-*.js',
          '**/qr-vendor-*.js',
        ],
        // Runtime caching for the API
        runtimeCaching: [
          {
            // Always fetch HTML from network — fresh index.html references newest JS chunk hashes
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sarga-html',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
            const parts = id.split('node_modules/');
            const path = parts[parts.length - 1];
            
            // react-vendor
            if (
              path.startsWith('react/') ||
              path.startsWith('react-dom/') ||
              path.startsWith('react-router/') ||
              path.startsWith('react-router-dom/') ||
              path.startsWith('scheduler/') ||
              path.startsWith('@remix-run/')
            ) {
              return 'react-vendor';
            }
            
            // sentry-vendor (dynamically imported — isolate from other chunks
            // to prevent TDZ errors from mixed deployment chunks)
            if (
              path.startsWith('@sentry/')
            ) {
              return 'sentry-vendor';
            }
            
            
            // charts-vendor
            if (
              path.startsWith('recharts/') ||
              path.startsWith('victory-vendor/') ||
              path.startsWith('d3-') ||
              path.startsWith('d3/')
            ) {
              return 'charts-vendor';
            }
            
            // ui-vendor
            if (
              path.startsWith('lucide-react/') ||
              path.startsWith('@dnd-kit/') ||
              path.startsWith('react-easy-crop/') ||
              path.startsWith('react-hot-toast/') ||
              path.startsWith('dompurify/')
            ) {
              return 'ui-vendor';
            }
            
            // excel-vendor
            if (
              path.startsWith('excel/') ||
              path.startsWith('xlsx/') ||
              path.startsWith('boneyard-js/')
            ) {
              return 'excel-vendor';
            }
            
            // query-vendor
            if (
              path.startsWith('@tanstack/react-query')
            ) {
              return 'query-vendor';
            }
            
            // form-vendor
            if (
              path.startsWith('react-hook-form/') ||
              path.startsWith('@hookform/resolvers/') ||
              path.startsWith('zod/')
            ) {
              return 'form-vendor';
            }
            
            // network-vendor
            if (
              path.startsWith('socket.io-client/') ||
              path.startsWith('engine.io-client/') ||
              path.startsWith('axios/') ||
              path.startsWith('jwt-decode/')
            ) {
              return 'network-vendor';
            }
            
            // tanstack-virtual-vendor (virtualized lists, heavy)
            if (
              path.startsWith('@tanstack/react-virtual')
            ) {
              return 'tanstack-virtual-vendor';
            }
            
            // qr-vendor (QR code generation/scanning, used on demand)
            if (
              path.startsWith('qrcode/') ||
              path.startsWith('jsqr/') ||
              path.startsWith('html5-qrcode/')
            ) {
              return 'qr-vendor';
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
    minify: true,
    sourcemap: false,
    // Set chunk size warning limit to 500
    chunkSizeWarningLimit: 500,
    // Emit module preload polyfill
    modulePreload: {
      polyfill: false
    },
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
