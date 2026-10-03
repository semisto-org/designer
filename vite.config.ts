import react from '@vitejs/plugin-react'
import inertia from '@inertiajs/vite'
import tailwindcss from '@tailwindcss/vite'
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

export default defineConfig({
  plugins: [
    tailwindcss(),
    RubyPlugin(),
    inertia(),
    react(),
    railsLocales(),
  ],
  worker: { format: 'es' },
  server: {
    watch: { ignored: ['**/tmp/**', '**/log/**', '**/node_modules/**'] },
  },
})
