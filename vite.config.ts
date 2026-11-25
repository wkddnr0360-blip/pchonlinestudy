import { randomUUID } from 'node:crypto'
import { readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { BookIndex } from './src/book/types'

const base = process.env.PAGES_BASE ?? '/'
const publicPreview = process.env.VITE_PUBLIC_PREVIEW === '1'
const release = { id: randomUUID(), builtAt: Date.now() }
const workerFile = 'sw-' + release.id + '.js'
const legacyEntries = ['assets/index-C_VShATN.js', 'assets/index-DFWwxs5v.js']
let outputDirectory: string

export default defineConfig({
  base,
  define: { __ONS_BUILD__: JSON.stringify(release) },
  plugins: [
    {
      name: 'ons-release',
      apply: 'build',
      generateBundle(_options, bundle) {
        this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify(release) })

        const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry)
        if (!entry || entry.type !== 'chunk') throw new Error('App entry script is missing.')

        // Cached Pages HTML can still point to either previously published entry script.
        const styles = [...(entry.viteMetadata?.importedCss ?? [])].map((file) => base + file)
        const bridge = `import ${JSON.stringify('./' + basename(entry.fileName))};
const currentStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
for (const href of ${JSON.stringify(styles)}) {
  if (currentStyles.some((link) => link.href === new URL(href, location.href).href)) continue;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}
`
        for (const fileName of legacyEntries) {
          if (fileName !== entry.fileName) this.emitFile({ type: 'asset', fileName, source: bridge })
        }
      },
    },
    {
      name: 'ons-public-preview',
      apply: 'build',
      configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir) },
      async writeBundle() {
        if (!publicPreview) return
        const path = resolve(outputDirectory, 'book/manifest.json')
        const manifest = JSON.parse(await readFile(path, 'utf8')) as BookIndex
        const stage = manifest.stages.find((entry) => entry.stage === 1)
        if (!stage) throw new Error('Preview cannot be built without the stage one book index.')
        const chapters = new Set(stage.parts.flatMap((part) => part.chapters.map(({ key }) => key + '.json')))
        const dataDirectory = resolve(outputDirectory, 'book', manifest.version)
        const files = await readdir(dataDirectory)
        await Promise.all(files.filter((file) => !chapters.has(file)).map((file) => unlink(resolve(dataDirectory, file))))
        manifest.count = stage.parts.reduce((sum, part) => sum + part.count, 0)
        manifest.stages = [stage]
        await writeFile(path, JSON.stringify(manifest))
        await rm(resolve(outputDirectory, 'challenge'), { recursive: true, force: true })
      },
    },
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      filename: workerFile,
      manifest: {
        id: base,
        name: '박철한 온스',
        short_name: '박철한 온스',
        lang: 'ko',
        display: 'standalone',
        background_color: '#f8f9fc',
        theme_color: '#f8f9fc',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/ons-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/ons-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/ons-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cacheId: 'ons-' + release.id,
        clientsClaim: true,
        cleanupOutdatedCaches: false,
        globPatterns: ['**/*.{html,js,css,svg,png,webp,woff2}', 'book/manifest.json'],
        navigateFallback: base + 'index.html',
        navigateFallbackDenylist: [/[?&]ons-retry=/],
        runtimeCaching: [
          ...(publicPreview ? [{
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && /\/book\/[a-f0-9]+\/[23]-[1-2]-\d+\.json$/.test(url.pathname),
            handler: async () => new Response(null, { status: 404 }),
          }] : []),
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/book\/[a-f0-9]+\/[^/]+\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'police-ox-book', cacheableResponse: { statuses: [200] } },
          }, {
            // An older tab can still lazy-load its own hashed assets after a new worker takes over.
            urlPattern: ({ url, sameOrigin }) => sameOrigin
              && url.href.startsWith((self as unknown as { registration: { scope: string } }).registration.scope + 'assets/')
              && /-[\w-]{8,}\.(?:js|css)$/.test(url.pathname),
            handler: async ({ request }) => (await caches.match(request)) ?? fetch(request),
          },
        ],
      },
    }),
    {
      name: 'ons-legacy-worker-url',
      apply: 'build',
      closeBundle: {
        order: 'post',
        sequential: true,
        async handler(error) {
          if (error) return
          // Older releases only know /sw.js and cannot send the update confirmation.
          const worker = await readFile(resolve(outputDirectory, workerFile), 'utf8')
          await writeFile(resolve(outputDirectory, 'sw.js'), 'self.skipWaiting();\n' + worker)
        },
      },
    },
  ],
})
