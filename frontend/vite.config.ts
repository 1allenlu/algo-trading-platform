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
      // During development, proxy /api calls to the FastAPI backend.
      // This avoids CORS issues and mirrors the production nginx setup.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
