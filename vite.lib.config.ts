import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

/** theme.css and tailwind.css ship as their own files: a host may skip the colours or use its own. */
function emitStaticCss (): Plugin {
  return {
    name: 'emit-static-css',
    closeBundle () {
      for (const f of ['theme.css', 'tailwind.css']) {
        writeFileSync(resolve(__dirname, 'dist-lib', f), readFileSync(resolve(__dirname, 'syn-text-editor/styles', f), 'utf8'))
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    emitStaticCss(),
    dts({
      include: ['syn-text-editor/**'],
      exclude: ['syn-text-editor/__tests__/**', 'test-preview/**'],
      outDir: 'dist-lib',
      entryRoot: 'syn-text-editor',
      tsconfigPath: './tsconfig.lib.json',
    }),
  ],
  resolve: {
    alias: { '@syn': resolve(__dirname, './syn-text-editor') },
  },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    lib: {
      // Two entries. `view` is the server-safe half (model, HTML, viewer) — a Server Component importing it
      // never pulls in the editor, its hooks or "use client".
      entry: {
        index: resolve(__dirname, 'syn-text-editor/library-entry.ts'),
        view: resolve(__dirname, 'syn-text-editor/view-entry.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
      output: {
        assetFileNames: 'index.css',
        // The editor entry is client code for Next.js' App Router; the view entry must not be.
        banner: (chunk) => (chunk.isEntry && chunk.name === 'index' ? '"use client";' : ''),
      },
      onwarn (warning, warn) {
        // Our own "use client" lines inside modules: the banner above re-adds the one that matters.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      },
    },
    sourcemap: true,
    // Consumers' bundlers minify.
    minify: false,
  },
})
