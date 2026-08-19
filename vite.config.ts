import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.npm_package_version || '3.2.2';
  const buildTime = new Date().toISOString();

  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,ico,png,svg,json}'],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            }
          ],
          importScripts: ['/firebase-messaging-sw.js'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
        },
        manifest: {
          name: 'MovizNow',
          short_name: 'MovizNow',
          description: 'Your ultimate movies & series destination',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          icons: [
            {
              src: '/launcher.svg?v=2.0',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: '/launcher.svg?v=2.0',
              sizes: '512x512',
              type: 'image/svg+xml'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version || '3.2.2'),
      '__BUILD_ID__': JSON.stringify(buildId),
      '__BUILD_TIME__': JSON.stringify(buildTime),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
