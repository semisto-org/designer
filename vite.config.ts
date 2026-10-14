import react from '@vitejs/plugin-react'
import inertia from '@inertiajs/vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import { parse } from 'yaml'

// Rails locale files (config/locales/*.yml) are the single source of the
// interface strings: the frontend imports them as JSON.
function railsLocales(): Plugin {
  return {
    name: 'rails-locales',
    transform(code, id) {
      if (!id.endsWith('.yml') && !id.endsWith('.yaml')) return null
      return { code: `export default ${JSON.stringify(parse(code))}`, map: null }
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
  server: {
    watch: { ignored: ['**/tmp/**', '**/log/**', '**/node_modules/**'] },
  },
})
