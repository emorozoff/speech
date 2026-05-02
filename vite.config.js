import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/speech/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        id: '/speech/',
        name: 'speech',
        short_name: 'speech',
        description: 'минималистичный телесуфлёр',
        lang: 'ru',
        start_url: '/speech/',
        scope: '/speech/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#000000',
        background_color: '#000000',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/speech/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
