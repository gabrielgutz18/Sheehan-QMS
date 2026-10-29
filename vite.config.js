import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import { createApi } from './server/api.js'

// serves the API at /api inside `npm run dev`, so login works without a second terminal; data is saved
// in the data folder (DATA_DIR in .env, data/ by default), the same database `npm start` uses
// set DEV_API=off in .env to forward /api to `npm start` on :3000 instead
function devApi(env) {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
        server.config.logger.warn('dev API disabled: set ADMIN_USERNAME and ADMIN_PASSWORD in .env')
        return
      }
      const api = createApi({
        adminUsername: env.ADMIN_USERNAME,
        adminPassword: env.ADMIN_PASSWORD,
        dataDir: env.DATA_DIR,
        googleSheet: env.GOOGLE_SHEET_URL && { url: env.GOOGLE_SHEET_URL, token: env.GOOGLE_SHEET_TOKEN },
      })
      server.middlewares.use('/api', api)
      // let go of the database when Vite restarts or stops
      server.httpServer?.once('close', api.close)
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
