// Renders the app icons from public/icon.svg: node script/icons.mjs (output committed in public/).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/icon.svg', 'utf8')
const inner = svg.replace(/<svg[^>]*>|<\/svg>/g, '').replace(/<rect[^>]*\/>/, '')
// Full-bleed square for maskable / Apple icons: content inside the 80 % safe zone.
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#5b5781"/><g transform="translate(3.2 3.2) scale(0.8)">${inner}</g></svg>`
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
for (const [file, source, size] of [['public/icon.png', svg, 512], ['public/icon-maskable.png', square, 512], ['public/apple-touch-icon.png', square, 180], ['public/favicon-32.png', svg, 32]]) {
  await page.setViewportSize({ width: size, height: size })
  const sized = source.replace(/<svg([^>]*?)( width="\d+" height="\d+")?>/, `<svg$1 width="${size}" height="${size}">`)
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`)
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
