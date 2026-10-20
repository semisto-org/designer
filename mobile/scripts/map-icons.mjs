// Draws the white glyphs that sit on the map's point discs
// (src/map/pointIcons.ts): Lucide icons, the app's and the website's set,
// rendered to PNG once and kept in assets/map-icons/. Run after adding a
// name to ICONS: node scripts/map-icons.mjs (needs the root's Playwright and its Chromium,
// CHROMIUM_PATH=/opt/pw-browsers/chromium in the cloud sandbox).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'assets', 'map-icons')
export const ICONS = [
  'calendar-days', 'circle-dot', 'circle-gauge', 'cloud-rain', 'cylinder', 'door-open', 'droplet', 'egg', 'faucet', 'gauge',
  'hexagon', 'moon', 'plug-zap', 'recycle', 'sticky-note', 'thermometer-snowflake', 'tree-deciduous',
  'paw-print', 'flower-2', 'sprout', 'map-pin',
]
const SIZE = 48

const attrs = (props) => Object.entries(props).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')

// Playwright lives in the website's packages (the repository root), not the app's.
const { chromium } = await import(pathToFileURL(join(here, '..', '..', 'node_modules', 'playwright', 'index.mjs')).href)
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 })
for (const name of ICONS) {
  // The icon module imports React Native: read its data literal instead.
  const source = readFileSync(join(here, '..', 'node_modules', 'lucide-react-native', 'dist', 'esm', 'icons', `${name}.mjs`), 'utf8')
  const data = new Function(`return ${source.match(/const __iconData = (\{[\s\S]*?\n\});/)[1]}`)()
  const body = data.node.map(([tag, props]) => `<${tag} ${attrs(props)}/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
  writeFileSync(join(out, `${name}.png`), await page.locator('svg').screenshot({ omitBackground: true }))
}
await browser.close()
console.log(`${ICONS.length} icons in assets/map-icons`)
