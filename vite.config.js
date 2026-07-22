import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Base-Pfad für GitHub Pages.
 * Lokal (dev) bleibt es '/'. Beim Production-Build wird der Repo-Name
 * vorangestellt, weil die App unter https://<user>.github.io/<REPO_NAME>/
 * ausgeliefert wird. Wer das Repo umbenennt: hier anpassen.
 */
const REPO_NAME = 'packliste';

export default defineConfig(({ mode }) => {
  const base = mode === 'production' ? `/${REPO_NAME}/` : '/';

  return {
    base,
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png'
        ],
        manifest: {
          name: 'Packliste',
          short_name: 'Packliste',
          description:
            'Packlisten verwalten – Vorlagen, Kategorien, Bibliothek.',
          theme_color: '#4f46e5',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          lang: 'de',
          // Macht die App zum Ziel im Teilen-Menü von Android: Wer eine
          // geteilte Vorlage bekommt, wählt „Packliste" und landet direkt in
          // der Import-Vorschau. GET reicht für Text und kommt ohne eigenen
          // Service Worker aus (Dateien bräuchten POST).
          share_target: {
            action: `${base}import`,
            method: 'GET',
            params: {
              title: 'title',
              text: 'text',
              url: 'url'
            }
          },
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          navigateFallback: `${base}index.html`
        },
        devOptions: {
          enabled: false
        }
      })
    ],
    server: {
      host: true,
      port: 5173
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./src/__tests__/setup.js']
    }
  };
});
