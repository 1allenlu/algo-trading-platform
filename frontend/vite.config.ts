import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    host: '0.0.0.0',   // Required for Docker — listen on all interfaces
    port: 5173,
    proxy: {
      // During development, proxy /api + /ws calls to the FastAPI backend.
      // VITE_BACKEND_URL=http://backend:8000 when running inside Docker.
      // Falls back to http://localhost:8000 for local (non-Docker) dev.
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: (process.env.VITE_BACKEND_URL ?? 'http://localhost:8000').replace('http', 'ws'),
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
