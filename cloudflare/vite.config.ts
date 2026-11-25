import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, normalizePath } from 'vite'

const root = fileURLToPath(new URL('./web/', import.meta.url))
const project = normalizePath(fileURLToPath(new URL('../', import.meta.url)))
const privateRoots = ['public/', 'tests/', 'fixtures/', 'worker/'].map((directory) => project + directory)
const approvedBrandAssets = new Set(['public/characters/teacher.webp', 'public/icons/ons-192.png'].map((path) => project + path))

export default defineConfig({
  root,
  envDir: false,
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'ons2-client-boundary',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue
          for (const id of Object.keys(output.modules)) {
            const path = normalizePath(id.replace(/^\0/, '').split('?')[0])
            if (!approvedBrandAssets.has(path) && privateRoots.some((directory) => path.startsWith(directory))) {
              this.error('The Workers client imports a private, legacy, or test module.')
            }
          }
        }
      },
    },
  ],
  build: {
    outDir: fileURLToPath(new URL('../.ons2/client/', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
  },
})
