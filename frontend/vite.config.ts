import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // En `bun run dev`, reenvía /api al backend real corriendo por
      // separado (ej. `docker compose up`). En producción, un único
      // servidor Boost.Beast sirve ambos desde :8090 (ver Dockerfile).
      '/api': 'http://localhost:8090',
    },
  },
})
