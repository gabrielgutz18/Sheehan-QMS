import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import { createApi } from './server/api.js'

// serves the in-memory dev API at /api inside `npm run dev`, so login works without a second terminal
// set DEV_API=off in .env to forward /api to a real backend on :3000 instead
function devApi(env) {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
        server.config.logger.warn('dev API disabled: set ADMIN_USERNAME and ADMIN_PASSWORD in .env')
        return
      }
      server.middlewares.use('/api', createApi({
        adminUsername: env.ADMIN_USERNAME,
        adminPassword: env.ADMIN_PASSWORD,
      }))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' loads every key, not just VITE_*; these stay in Node and never reach the browser
  const env = loadEnv(mode, process.cwd(), '')
  const useDevApi = env.DEV_API !== 'off'

  return {
    plugins: [react(), useDevApi && devApi(env)],
    server: {
      // forward /api requests to the real backend during development
      proxy: useDevApi ? undefined : {
        '/api': 'http://localhost:3000',
      },
    },
  }
})
