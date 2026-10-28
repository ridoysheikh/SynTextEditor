import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@syn': resolve(__dirname, './syn-text-editor'),
      '@test-preview': resolve(__dirname, './test-preview'),
    },
  },
})
