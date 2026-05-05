import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // @shared → platform frontend src (shared components)
      '@shared': path.resolve(__dirname, '../../frontend/src'),
    },
  },
})
