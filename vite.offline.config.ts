import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { build, defineConfig, type Plugin } from 'vite'
import { railsLocales } from './vite.config'

// The viewer of the offline site (OfflineSite::Builder): one classic script
// and one stylesheet, every image and font inlined, because a page opened
// from a folder (file://) may load scripts and styles beside it but neither
// ES modules, nor module workers, nor files read by fetch().
//
//   npm run build:offline   →   public/offline-viewer/terranova.{js,css}

const root = fileURLToPath(new URL('.', import.meta.url))
const WORKER_IMPORT = /maplibre-gl-worker\.mjs\?worker&url$/

// MapLibre's worker is an ES module the page would load from a URL: build it
// as one classic script and hand MapLibre a blob: URL of it instead. A page
// opened from a folder cannot start a module worker, even from a blob: the
// `.cjs` fragment makes MapLibre start a classic one.
function inlineMapLibreWorker(): Plugin {
  const id = '\0offline-maplibre-worker'
  return {
    name: 'offline-maplibre-worker',
    enforce: 'pre',
    resolveId(source) {
      return WORKER_IMPORT.test(source) ? id : null
    },
    async load(loaded) {
      if (loaded !== id) return null
      const result = await build({
        configFile: false,
        logLevel: 'silent',
        build: {
          write: false,
          minify: true,
          lib: { entry: `${root}node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`, formats: ['iife'], name: 'maplibreWorker' },
        },
      })
      const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []))
      const chunk = outputs.find((o) => o.type === 'chunk')
      if (!chunk || chunk.type !== 'chunk') throw new Error('MapLibre worker build produced no script')
      return `export default URL.createObjectURL(new Blob([${JSON.stringify(chunk.code)}], { type: 'text/javascript' })) + '#maplibre-gl-worker.cjs'`
    },
  }
}

export default defineConfig({
  root,
  publicDir: false,
  plugins: [inlineMapLibreWorker(), tailwindcss(), react(), railsLocales()],
  resolve: { alias: { '@': `${root}app/frontend` } },
  assetsInclude: ['**/*.pbf'],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'public/offline-viewer',
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    lib: {
      entry: 'app/frontend/offline/main.tsx',
      formats: ['iife'],
      name: 'TerranovaOffline',
      fileName: () => 'terranova.js',
      cssFileName: 'terranova',
    },
  },
})
