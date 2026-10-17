// Measures what a page view of Terranova weighs, the EcoIndex way
// (ecoindex.fr): a 1920 × 1080 window, the page loaded, three seconds, a
// scroll to the bottom, three more seconds; then the elements in the page,
// the requests and the bytes transferred. The server turns these counts into
// a score and a grade (EcoIndex, EcoMeasurement).
//
//   node script/ecoindex.mjs --production https://terranova.semisto.org \
//     --copy http://localhost:3000 --map 1 --plant 1 --out tmp/ecoindex.json \
//     [--commit SHA] [--post https://terranova.semisto.org]   # with ECOINDEX_TOKEN set
//
// Public pages are measured on --production. The signed-in screens are
// measured on --copy, a development server of the same commit signed in
// through /dev/login with a demo map (bin/rails ecoindex:demo). That server
// does not compress, so text responses count at their gzip size, as
// production's proxy sends them.
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
)

const PUBLIC = { home: '/', features: '/fonctionnalites', pricing: '/tarifs', help: '/help', sign_in: '/session/new', ecoconception: '/ecoconception' }
const SIGNED_IN = { maps: '/maps', editor: `/maps/${args.map}`, catalogue: '/plants', plant: `/plants/${args.plant}` }
const TEXT = /javascript|css|json|html|svg|text|wasm/

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})

async function measure(base, path, { signIn = false, gzip = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  if (signIn) {
    const login = await context.newPage()
    await login.goto(`${base}/dev/login?email=${encodeURIComponent('ecoindex@semisto.org')}`)
    await login.close()
  }
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const responses = {}
  const sizes = []
  let requests = 0
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    requests += 1
    const encoded = Object.keys(response.headers).some((name) => name.toLowerCase() === 'content-encoding')
    responses[requestId] = { mime: response.mimeType, encoded }
  })
  cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const response = responses[requestId] ?? {}
    if (!gzip || response.encoded || !TEXT.test(response.mime ?? '')) return sizes.push(encodedDataLength)
    sizes.push(
      cdp.send('Network.getResponseBody', { requestId }).then(
        ({ body, base64Encoded }) => gzipSync(Buffer.from(body, base64Encoded ? 'base64' : 'utf8')).length,
        () => encodedDataLength,
      ),
    )
  })
  await page.goto(base + path, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForTimeout(3000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(3000)
  // An SVG counts as one element, as in EcoIndex's own counter.
  const domElements = await page.evaluate(
    () => [...document.querySelectorAll('*')].filter((el) => !el.parentElement?.closest('svg')).length,
  )
  const bytes = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0)
  await context.close()
  return { url: path, dom_elements: domElements, requests, bytes, measured_at: new Date().toISOString() }
}

const measurements = []
if (args.production) {
  for (const [screen, path] of Object.entries(PUBLIC)) {
    measurements.push({ screen, environment: 'production', ...(await measure(args.production, path)) })
  }
}
if (args.copy) {
  for (const [screen, path] of Object.entries(SIGNED_IN)) {
    measurements.push({ screen, environment: 'test_copy', ...(await measure(args.copy, path, { signIn: true, gzip: true })) })
  }
}
await browser.close()

const report = { commit: args.commit || process.env.GITHUB_SHA || null, measurements }
for (const row of measurements) console.log(`${row.screen.padEnd(14)} ${String(row.dom_elements).padStart(5)} elements ${String(row.requests).padStart(4)} requests ${String(Math.round(row.bytes / 1024)).padStart(6)} KB`)
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2))

if (args.post) {
  const token = process.env.ECOINDEX_TOKEN
  if (!token) {
    console.log('ECOINDEX_TOKEN is not set: nothing sent.')
  } else {
    const response = await fetch(`${args.post.replace(/\/$/, '')}/eco_measurements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(report),
    })
    console.log(`POST /eco_measurements: ${response.status} ${await response.text()}`)
    if (!response.ok) process.exit(1)
  }
}
