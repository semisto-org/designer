// Screenshot a page of the running app as a signed-in dev user.
// Usage: node script/screenshot.mjs /maps/1 tmp/shot.png [--mobile] [--wait=3000]
// Requires `bin/rails s` on PORT (default 3000). Development only.
import { chromium, devices } from 'playwright'

const [path = '/maps', out = 'tmp/screenshot.png', ...flags] = process.argv.slice(2)
const port = process.env.PORT ?? '3000'
const base = `http://localhost:${port}`
const mobile = flags.includes('--mobile')
const wait = Number(flags.find((f) => f.startsWith('--wait='))?.split('=')[1] ?? 2500)
const email = process.env.DEV_EMAIL ?? 'dev@semisto.org'

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`${base}/dev/login?email=${encodeURIComponent(email)}&return_to=${encodeURIComponent(path)}`)
await page.waitForTimeout(wait)
await page.screenshot({ path: out, fullPage: false })
console.log(JSON.stringify({ url: page.url(), out, errors: errors.slice(0, 10) }, null, 2))
await browser.close()
