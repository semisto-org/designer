// Regenerates public/og-image.png (Open Graph preview) from the live home page.
// Usage: bin/rails s -p 3016 -d; CHROMIUM_PATH=... node script/og-image.mjs
// Needs a running dev server with the home page reachable signed out.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto('http://localhost:3016/')
await page.waitForSelector('svg[role=img]')
const map = await page.$eval('svg[role=img]', (el) => el.outerHTML)
const logo = await page.$eval('header svg', (el) => el.outerHTML)
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:"DejaVu Sans",sans-serif;background:linear-gradient(135deg,#f4f3f8 0%,#f7f5f2 60%,#daeadb 100%);color:#1b1712;display:flex;align-items:center;padding:0 64px;gap:48px;overflow:hidden}
.left{flex:1}
.brand{display:flex;align-items:center;gap:14px;font-weight:700;font-size:26px}
.brand svg{width:44px;height:44px}
h1{margin-top:44px;font-size:52px;line-height:1.12;letter-spacing:-.5px;font-weight:700}
h1 span{color:#5b5781}
p{margin-top:26px;font-size:24px;line-height:1.4;color:#554c3f}
.url{margin-top:38px;font-size:20px;font-weight:700;color:#2f6334}
.card{width:520px;height:422px;border-radius:22px;overflow:hidden;box-shadow:0 20px 50px rgba(43,41,64,.25);border:1px solid #dbd3c9;flex:none}
.card svg{width:100%;height:100%;display:block}
</style></head><body>
<div class="left"><div class="brand">${logo}<span>Semisto Designer</span></div>
<h1>Votre terrain, <span>compris en profondeur.</span></h1>
<p>Cartographiez votre terrain, concevez votre jardin-forêt, avec Claude à vos côtés.</p>
<div class="url">designer.semisto.org</div></div>
<div class="card">${map}</div></body></html>`
writeFileSync('tmp/og.html', html) // tmp/ is git-ignored
const og = await (await browser.newContext({ viewport: { width: 1200, height: 630 } })).newPage()
await og.goto('file://' + process.cwd() + '/tmp/og.html')
await og.waitForTimeout(300)
await og.screenshot({ path: 'public/og-image.png' })
await browser.close()
