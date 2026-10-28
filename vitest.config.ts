import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@syn': resolve(__dirname, './syn-text-editor'),
    },
  },
  test: {
    environment: 'node',
    include: ['syn-text-editor/**/__tests__/**/*.test.ts'],
  },
})
