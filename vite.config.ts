import react from '@vitejs/plugin-react'
import inertia from '@inertiajs/vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { browserLocales } from './app/frontend/lib/browserLocales'
import { deepMerge, segmentsUsed, splitSegments } from './app/frontend/lib/localeSegments'
import RubyPlugin from 'vite-plugin-ruby'
import { parse } from 'yaml'

// Rails locale files (config/locales/*.yml) are the single source of the
// interface strings: the frontend imports them as JSON. Server-only subtrees
// are left out (browserLocales). They weigh 700 KB, so they are cut into
// segments (lib/localeSegments) and each module of app/frontend imports the
// segments its key strings name: a page's strings travel with its code, and a
// panel fetched on demand brings its own. `virtual:rails-locale/all` holds
// everything, for the rare key no module spells out (lib/i18n).
const LOCALES_DIR = join(__dirname, 'config/locales')
const SEGMENT = 'virtual:rails-locale/'
const FRONTEND = join(__dirname, 'app/frontend') + '/'
const NOT_SCANNED = /\/lib\/(i18n|localeSegments|browserLocales)\.ts$/

// A string handed to JSON.parse is read several times faster than the same
// object written as JavaScript.
const jsonModule = (data: unknown) => `JSON.parse(${JSON.stringify(JSON.stringify(data))})`

export function railsLocales(): Plugin {
  let segments: Map<string, Record<string, unknown>> | null = null
  const load = () => {
    if (segments) return segments
    const merged: Record<string, Record<string, unknown>> = {}
    for (const name of readdirSync(LOCALES_DIR).filter((file) => file.endsWith('.yml')).sort()) {
      const tree = browserLocales(parse(readFileSync(join(LOCALES_DIR, name), 'utf8')) as Record<string, unknown>)
      for (const [locale, keys] of Object.entries(tree)) merged[locale] = deepMerge(merged[locale] ?? {}, keys as Record<string, unknown>)
    }
    return (segments = splitSegments(merged))
  }
  return {
    name: 'rails-locales',
    resolveId(id) {
      return id.startsWith(SEGMENT) ? `\0${id}` : null
    },
    load(id) {
      if (!id.startsWith(`\0${SEGMENT}`)) return null
      for (const name of readdirSync(LOCALES_DIR)) this.addWatchFile(join(LOCALES_DIR, name))
      const name = id.slice(SEGMENT.length + 1)
      const register = (segment: string, data: unknown) => `register(${JSON.stringify(segment)}, ${jsonModule(data)})`
      const body = name === 'all' ? [...load()].map(([segment, data]) => register(segment, data)).join('\n') : register(name, load().get(name) ?? {})
      return `import { register } from '@/lib/i18n'\n${body}\n`
    },
    watchChange(id) {
      if (id.startsWith(LOCALES_DIR)) segments = null
    },
    transform(code, id) {
      if (id.endsWith('.yml') || id.endsWith('.yaml')) {
        const tree = parse(code) as Record<string, unknown>
        const data = id.includes('/config/locales/') ? browserLocales(tree) : tree
        return { code: `export default ${jsonModule(data)}`, map: null }
      }
      if (!id.startsWith(FRONTEND) || !/\.(tsx?|jsx?)$/.test(id) || NOT_SCANNED.test(id)) return null
      const used = segmentsUsed(code, load().keys())
      if (used.size === 0) return null
      const imports = [...used].sort().map((segment) => `import ${JSON.stringify(SEGMENT + segment)};`).join('')
      // Imports are hoisted: appended, they still run before the module's
      // own code, and nothing above them moves (the source map stays true).
      return { code: `${code}\n${imports}`, map: null }
    },
  }
}

// pdf.js decodes JPEG 2000 and JBIG2 images and ICC colours with WebAssembly
// modules it fetches by name from a folder (`wasmUrl`, `iccUrl`): without
// them, a PDF's photos (Canva and iLovePDF write JPEG 2000) do not show.
// The folder is served as is, unhashed, under the build's `pdfjs/`.
const PDFJS_ASSETS: Record<string, RegExp> = {
  wasm: /^(openjpeg|jbig2|qcms).*\.(wasm|js)$|^LICENSE/,
  iccs: /./,
}

function pdfjsAssets(): Plugin {
  const source = (folder: string) => join(__dirname, 'node_modules/pdfjs-dist', folder)
  const files = () =>
    Object.entries(PDFJS_ASSETS).flatMap(([folder, pattern]) =>
      readdirSync(source(folder)).filter((name) => pattern.test(name)).map((name) => `${folder}/${name}`),
    )
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = request.url?.match(/\/pdfjs\/([a-z]+\/[^/?]+)/)
        if (!match || !files().includes(match[1])) return next()
        response.setHeader('Content-Type', match[1].endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        response.end(readFileSync(join(source(''), match[1])))
      })
    },
    generateBundle() {
      for (const file of files()) this.emitFile({ type: 'asset', fileName: `pdfjs/${file}`, source: readFileSync(join(source(''), file)) })
    },
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    RubyPlugin(),
    inertia(),
    react(),
    railsLocales(),
    pdfjsAssets(),
  ],
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      output: {
        // Every icon and UI primitive would otherwise be its own file of a few
        // hundred bytes: the map editor fetched about a hundred scripts.
        codeSplitting: {
          groups: [
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, includeDependenciesRecursively: false },
            { name: 'ui', test: /app[\\/]frontend[\\/]components[\\/]ui[\\/]/, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
  server: {
    watch: { ignored: ['**/tmp/**', '**/log/**', '**/node_modules/**'] },
  },
})
