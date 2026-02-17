import build from '@hono/vite-cloudflare-pages'
import { defineConfig, type Plugin } from 'vite'

function servePublicIndex(): Plugin {
  return {
    name: 'serve-public-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/') {
          req.url = '/index.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    servePublicIndex(),
    build({ entry: 'src/index.ts' }),
  ],
})
