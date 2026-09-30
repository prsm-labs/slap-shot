import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev only: serve the Vercel functions in api/ from the Vite dev server, so /api/live works
// under `npm run dev` the same way it does on Vercel. Production never uses this.
function vercelApiInDev() {
  return {
    name: 'vercel-api-in-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const match = url.pathname.match(/^\/api\/([\w-]+)$/)
        if (!match) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`)
          const shim = {
            status(code) { res.statusCode = code; return shim },
            json(body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) },
            setHeader: (k, v) => res.setHeader(k, v),
          }
          await mod.default({ query: Object.fromEntries(url.searchParams) }, shim)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vercelApiInDev()],
})
