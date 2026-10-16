// Make the screenshots of the help guides listed in app/help/captures.yml,
// from a real map, as the dev user. Run it after a redesign: the guides
// show the new screens at once.
//
//   HELP_MAP_ID=1 node script/help_captures.mjs [name…]
//
// Requires `bin/rails s` on PORT (default 3000) in development, and a map
// HELP_MAP_ID that the dev user (DEV_EMAIL) can edit, and a dev user who
// has chosen an account kind and seen the editor tour (else their welcome
// screens hide the panels). Writes WebP files to public/help/captures/.
// Pick a well-drawn map: the captures show it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'
import { parse } from 'yaml'

const only = process.argv.slice(2)
const port = process.env.PORT ?? '3000'
const base = `http://localhost:${port}`
const mapId = process.env.HELP_MAP_ID ?? '1'
const email = process.env.DEV_EMAIL ?? 'dev@semisto.org'
const outDir = 'public/help/captures'
const captures = parse(readFileSync('app/help/captures.yml', 'utf8')).filter((c) => only.length === 0 || only.includes(c.name))
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const report = []
for (const capture of captures) {
  const context = await browser.newContext(capture.mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const path = capture.panel ? `/maps/${mapId}?panel=${capture.panel}` : capture.path.replace('{map}', mapId)
  await page.goto(`${base}/dev/login?email=${encodeURIComponent(email)}&return_to=${encodeURIComponent(path)}`)
  // Hide what moves or belongs to the dev session: toasts, the quick switcher hint.
  await page.addStyleTag({ content: '[role="status"]{visibility:hidden!important} *{animation:none!important;transition:none!important}' })
  const selector = capture.selector ?? (capture.panel ? `[data-editor-panel="${capture.panel}"]` : 'body')
  const file = `${outDir}/${capture.name}.webp`
  try {
    const target = page.locator(selector).first()
    await target.waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(capture.wait ?? 1500)
    // Playwright writes PNG or JPEG; Chromium itself turns it into WebP.
    // A long panel is cut at its first screenful: the guide shows where to look, not all of it.
    const box = await target.boundingBox()
    const maxHeight = capture.maxHeight ?? (capture.panel ? 760 : 1100)
    const png = box && box.height > maxHeight
      ? await page.screenshot({ type: 'png', clip: { x: box.x, y: box.y, width: box.width, height: maxHeight } })
      : await target.screenshot({ type: 'png' })
    const webp = await page.evaluate(async (data) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = new OffscreenCanvas(image.width, image.height)
      canvas.getContext('2d').drawImage(image, 0, 0)
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(binary)
    }, png.toString('base64'))
    writeFileSync(file, Buffer.from(webp, 'base64'))
    report.push({ name: capture.name, file })
  } catch (error) {
    report.push({ name: capture.name, error: String(error.message ?? error).split('\n')[0] })
  }
  await context.close()
}
await browser.close()
console.log(JSON.stringify(report, null, 2))
