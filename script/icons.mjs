// Draws the app icon « Quatre couronnes » (one tree seen from above, its crown
// at years 1, 5, 15 and 30, each year a pencil ring) and renders every size the
// website and the phone app need: node script/icons.mjs (output is committed).
//
// - docs/brand/*.svg: the masters (painted = watercolour filters, flat = plain
//   vector for small inline use).
// - public/: favicon, PWA and Apple touch icons, and icon.svg (flat).
// - mobile/assets/images/: iOS (also used on Mac), Android adaptive
//   foreground and monochrome, splash and web favicon.
// - docs/brand/app-icon-macos.png: the icon on the macOS grid, for a Mac build
//   or store listing.
//
// Shapes come from a seeded generator, so a run always draws the same icon.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const PAPER = '#f7f3ea'
const PRUNE_700 = '#4a4668'
const PRUNE_900 = '#2b2940'
// Crown washes, from year 30 (outside, young leaves) to year 1 (centre).
const CROWNS = [
  { r: 330, color: '#c2cf45', alpha: 0.8, offset: [14, 10] },
  { r: 230, color: '#8fbf6a', alpha: 0.85, offset: [8, 4] },
  { r: 140, color: '#5e8f52', alpha: 0.9, offset: [3, 2] },
  { r: 62, color: '#2f5d36', alpha: 0.95, offset: [0, 0] },
]

function random(seed) {
  // mulberry32
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fmt = (n) => n.toFixed(1)

/** A closed, slightly irregular round shape. */
function blob(cx, cy, r, { wobble = 0.07, seed = 1, n = 90 } = {}) {
  const rnd = random(seed)
  const k = Array.from({ length: 5 }, () => [rnd() * 2 - 1, rnd() * 6.28])
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const d = 1 + wobble * k.reduce((s, [amp, ph], j) => s + (amp * Math.sin((j + 2) * a + ph)) / (j + 1), 0)
    pts.push(`${fmt(cx + r * d * Math.cos(a))},${fmt(cy + r * d * Math.sin(a))}`)
  }
  return `M${pts.join(' L')} Z`
}

/** A hand-drawn circle: open, its end overshooting its start. */
function ring(cx, cy, r, { seed = 1, wobble = 0.035, over = 0.35, drift = 0.04, n = 120 } = {}) {
  const rnd = random(seed)
  const a0 = rnd() * 6.28
  const k = Array.from({ length: 4 }, () => [rnd() * 2 - 1, rnd() * 6.28])
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = a0 + (2 * Math.PI + over) * t
    const d = 1 + wobble * k.reduce((s, [amp, ph], j) => s + (amp * Math.sin((j + 2) * a + ph)) / (j + 1), 0) + drift * (t - 0.5)
    pts.push(`${fmt(cx + r * d * Math.cos(a))},${fmt(cy + r * d * Math.sin(a))}`)
  }
  return `M${pts.join(' L')}`
}

const FILTERS = `
  <filter id="paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0.10 0" result="ga"/>
    <feComposite in="ga" in2="SourceGraphic" operator="in" result="gi"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gi"/></feMerge>
  </filter>
  <filter id="wc" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="11" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 1.35" result="ta"/>
    <feComposite in="d" in2="ta" operator="in"/>
  </filter>
  <filter id="pencil" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="15" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="17" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.7" result="ga"/>
    <feComposite in="d" in2="ga" operator="in"/>
  </filter>`

/** Watercolour wash: three glazed layers and a darker pigment rim. */
function wash(cx, cy, r, color, seed, alpha, painted) {
  const layers = [0, 1, 2].map(
    (j) => `<path d="${blob(cx + 6 * j, cy - 4 * j, r * (1 - 0.06 * j), { seed: seed * 7 + j })}" fill="${color}" fill-opacity="${(0.42 * alpha).toFixed(2)}"/>`,
  )
  layers.push(`<path d="${blob(cx, cy, r, { seed: seed * 7 })}" fill="none" stroke="${color}" stroke-opacity="${(0.75 * alpha).toFixed(2)}" stroke-width="${fmt(Math.max(3, r * 0.03))}"/>`)
  return painted ? `<g filter="url(#wc)">${layers.join('')}</g>` : layers.join('')
}

/**
 * The crowns and rings at a given scale around (512, 512).
 * mode: 'painted' (filters), 'flat' (no filters), 'mono' (Android themed icon: one colour, alpha only).
 */
function crowns(scale, mode = 'painted') {
  const painted = mode === 'painted'
  const pencil = painted ? ' filter="url(#pencil)"' : ''
  const c = 512
  const out = []
  if (mode === 'mono') {
    // Rings and the young crown only: washes would merge into one disc.
    CROWNS.slice(0, 3).forEach(({ r, offset: [ox, oy] }, i) =>
      out.push(`<path d="${ring(c + ox * scale - 4, c + oy * scale + 3, (r + 4) * scale, { seed: 30 + i })}" fill="none" stroke="#fff" stroke-width="${fmt(26 * scale)}" stroke-linecap="round"/>`),
    )
    out.push(`<path d="${blob(c, c, 62 * scale, { seed: 13 })}" fill="#fff"/>`)
    return out.join('\n')
  }
  CROWNS.forEach(({ r, color, alpha, offset: [ox, oy] }, i) => out.push(wash(c + ox * scale, c + oy * scale, r * scale, color, 10 + i, alpha, painted)))
  CROWNS.slice(0, 3).forEach(({ r, offset: [ox, oy] }, i) =>
    out.push(`<path d="${ring(c + ox * scale - 4, c + oy * scale + 3, (r + 4) * scale, { seed: 30 + i })}" fill="none" stroke="${PRUNE_700}" stroke-width="${fmt((painted ? 11 : 22) * scale)}" stroke-linecap="round"${pencil}/>`),
  )
  out.push(`<circle cx="${c}" cy="${c}" r="${fmt((painted ? 17 : 30) * scale)}" fill="${PRUNE_900}"${pencil}/>`)
  return out.join('\n')
}

function svg(body, { background = PAPER, painted = true, radius = 0 } = {}) {
  const bg = background ? `<rect width="1024" height="1024" rx="${radius}" fill="${background}"${painted ? ' filter="url(#paper)"' : ''}/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>${painted ? FILTERS : ''}</defs>
${bg}
${body}
</svg>
`
}

const masters = {
  // Full bleed: iOS, Mac, PWA (the crowns sit inside the 80 % maskable zone).
  'app-icon.svg': svg(crowns(1)),
  // Android adaptive foreground: inside the 66/108 safe circle, on the paper background colour.
  'app-icon-android-foreground.svg': svg(crowns(0.86), { background: null }),
  'app-icon-android-monochrome.svg': svg(crowns(0.86, 'mono'), { background: null, painted: false }),
  // Splash: the crowns alone.
  'app-icon-crowns.svg': svg(crowns(1.2), { background: null }),
  // Plain vector, rounded: favicon, inline logo, error pages.
  'app-icon-flat.svg': svg(crowns(1, 'flat'), { painted: false, radius: 230 }).replace(/\d+\.\d(?!\d)/g, (n) => String(Math.round(Number(n)))),
}

mkdirSync('docs/brand', { recursive: true })
for (const [name, content] of Object.entries(masters)) writeFileSync(`docs/brand/${name}`, content)
writeFileSync('public/icon.svg', masters['app-icon-flat.svg'].replace(' width="1024" height="1024"', ' width="512" height="512"'))

// macOS grid: an 824 px rounded square with a soft shadow on a 1024 canvas.
const macos = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>${FILTERS}<clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.3"/></filter></defs>
<rect x="100" y="100" width="824" height="824" rx="185" fill="${PAPER}" filter="url(#shadow)"/>
<g clip-path="url(#sq)"><g transform="translate(100 100) scale(0.8047)"><rect width="1024" height="1024" fill="${PAPER}" filter="url(#paper)"/>${crowns(1)}</g></g>
</svg>`

const renders = [
  ['public/icon.png', masters['app-icon.svg'], 512],
  ['public/icon-maskable.png', masters['app-icon.svg'], 512],
  ['public/apple-touch-icon.png', masters['app-icon.svg'], 180],
  ['public/favicon-32.png', masters['app-icon-flat.svg'], 32],
  ['mobile/assets/images/icon.png', masters['app-icon.svg'], 1024],
  ['mobile/assets/images/android-icon-foreground.png', masters['app-icon-android-foreground.svg'], 1024],
  ['mobile/assets/images/android-icon-monochrome.png', masters['app-icon-android-monochrome.svg'], 1024],
  ['mobile/assets/images/splash-icon.png', masters['app-icon-crowns.svg'], 400],
  ['mobile/assets/images/favicon.png', masters['app-icon-flat.svg'], 48],
  ['docs/brand/app-icon-macos.png', macos, 1024],
]

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage()
for (const [file, source, size] of renders) {
  // Filters are drawn at 1024 and scaled down, so every size shows the same grain.
  await page.setViewportSize({ width: 1024, height: 1024 })
  await page.setContent(`<html><body style="margin:0;background:transparent">${source}</body></html>`)
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } })
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="data:image/png;base64,${png.toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`,
  )
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
