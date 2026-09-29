import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName
  ? `/${repositoryName}/`
  : '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['padel.svg'],
      manifest: {
        name: 'Repartidor — Pádel en buena compañía',
        short_name: 'Repartidor',
        description: 'Organiza jornadas y resultados de pádel.',
        theme_color: '#f5f3ed',
        background_color: '#f5f3ed',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}pwa-192.svg`, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: `${base}pwa-512.svg`, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,ico,png}']
      }
    })
  ]
})
