// Regenerates public/og-image.png (Open Graph preview) from the live home page:
// the time-lapse hero becomes the card next to the brand and the tagline.
// Usage: bin/rails s -p 3016 -d; CHROMIUM_PATH=... node script/og-image.mjs
// Needs a running dev server with the home page reachable signed out.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const port = process.env.PORT || '3016'
const font = (pkg, file) => readFileSync(`node_modules/@fontsource-variable/${pkg}/files/${file}`).toString('base64')
const logo = readFileSync('public/icon.svg', 'utf8')

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await (await browser.newContext({ viewport: { width: 1040, height: 844 } })).newPage()
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('canvas')
// Scroll the time-lapse to year 15, when the crowns touch, and crop the garden.
await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.45)))
await page.waitForTimeout(2500)
const hero = (await page.screenshot({ type: 'png', clip: { x: 468, y: 232, width: 500, height: 406 } })).toString('base64')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:Garamond;src:url(data:font/woff2;base64,${font('eb-garamond', 'eb-garamond-latin-wght-normal.woff2')}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:Inter,sans-serif;background:#f7f5f2;color:#1b1712;display:flex;align-items:center;padding:0 64px;gap:48px;overflow:hidden}
.left{flex:1}
.brand{display:flex;align-items:center;gap:14px;font-weight:600;font-size:26px}
.brand svg{width:48px;height:48px;border-radius:12px}
h1{margin-top:40px;font-family:Garamond,serif;font-size:54px;line-height:1.08;font-weight:500}
h1 span{color:#5b5781}
p{margin-top:26px;font-size:24px;line-height:1.4;color:#554c3f}
.url{margin-top:36px;font-size:20px;font-weight:600;color:#2f6334}
.card{position:relative;width:520px;height:422px;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(43,41,64,.25);border:1px solid #dbd3c9;flex:none;background:url(data:image/png;base64,${hero}) center/cover}
.year{position:absolute;left:20px;bottom:16px;font-family:Garamond,serif;font-size:22px;color:#5b5781;background:rgba(247,245,242,.85);padding:4px 12px;border-radius:999px}
</style></head><body>
<div class="left"><div class="brand">${logo}<span>Semisto Terranova</span></div>
<h1>Dessine aujourd’hui <span>le jardin-forêt de 2056.</span></h1>
<p>Cartographie ton terrain, conçois ton jardin-forêt, avec ton IA à tes côtés.</p>
<div class="url">terranova.semisto.org</div></div>
<div class="card"><div class="year">an 15 du jardin-forêt</div></div></body></html>`
writeFileSync('tmp/og.html', html) // tmp/ is git-ignored
const og = await (await browser.newContext({ viewport: { width: 1200, height: 630 } })).newPage()
await og.goto('file://' + process.cwd() + '/tmp/og.html')
await og.waitForTimeout(300)
await og.screenshot({ path: 'public/og-image.png' })
await browser.close()
