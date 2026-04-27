import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA precaching makes local iteration painful (stale SW caches across rebuilds).
// Set DISABLE_PWA=1 to skip SW generation; production deploys leave it enabled.
const pwaDisabled = process.env.DISABLE_PWA === '1';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      disable: pwaDisabled,
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'jsd Guitar Tuner',
        short_name: 'jsd Tuner',
        description: 'jsd Guitar Tuner — a mobile-first music learning web app',
        theme_color: '#1E0032',
        background_color: '#1E0032',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'de',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
