import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { dataApiPlugin } from './vite-plugin-data-api'

export default defineConfig({
  plugins: [react(), dataApiPlugin({ dataDir: path.resolve(__dirname, 'data') })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
