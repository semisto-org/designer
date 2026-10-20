// Replays the six reference journeys of docs/quality/ on a computer and on a
// phone, and keeps a screenshot of every step: the material of the month's
// quality notebook. A person (or an AI) then lives the captures and scores
// each journey on the five questions of docs/point-of-view.md.
//
//   bin/rails journeys:prepare     # accounts and maps, ids in tmp/journeys/ids.json
//   node script/journeys.mjs [--out tmp/journeys/2026-10] [--only first_map,pay] [--device phone]
//
// Requires `bin/rails s` on PORT (default 3000), development only: it signs in
// through /dev/login. Address search is answered here (Purnode) so the
// journeys never depend on a geocoder. A step that fails is kept with its
// error and screenshot; the rest of that journey on that device is skipped,
// since it depends on it. The run exits 1 when any step failed.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, devices } from 'playwright'
import { parse } from 'yaml'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
)
const base = `http://localhost:${process.env.PORT ?? '3000'}`
const out = args.out ?? `tmp/journeys/${new Date().toISOString().slice(0, 7)}`

// The interface's own French strings, so the journeys click what a person reads.
const locales = {}
for (const file of readdirSync('config/locales').filter((name) => name.endsWith('.fr.yml') || name === 'fr.yml')) {
  merge(locales, parse(readFileSync(join('config/locales', file), 'utf8'))?.fr ?? {})
}
function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof target[key] === 'object') merge(target[key], value)
    else target[key] = value
  }
}
function t(key, vars = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales)
  if (typeof value !== 'string') throw new Error(`Missing locale key ${key}`)
  return value.replace(/%\{(\w+)\}/g, (_, name) => vars[name] ?? '')
}

const PURNODE = { label: 'Purnode, 5530 Yvoir', detail: 'Namur, Belgique', lng: 4.9418, lat: 50.3062, bbox: null, zoom: 18 }
const IDS = JSON.parse(readFileSync(args.ids ?? 'tmp/journeys/ids.json', 'utf8'))

async function signIn(page, email) {
  await page.goto(`${base}/dev/login?email=${encodeURIComponent(email)}&return_to=${encodeURIComponent('/up')}`)
}
async function scrollThrough(page, screens) {
  for (let i = 0; i < screens; i += 1) {
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(400)
  }
}

// Each journey: who lives it, and its steps. A step acts, then the page is
// captured as the person sees it.
const JOURNEYS = [
  {
    id: 'discover',
    title: 'Découvrir le site',
    steps: [
      ['Accueil', (page) => page.goto(`${base}/`)],
      ['Le temps passe', (page) => scrollThrough(page, 6)],
      ['Fin du défilement', (page) => scrollThrough(page, 30)],
      ['Fonctionnalités', (page) => page.goto(`${base}/fonctionnalites`)],
      ['Tarifs', (page) => page.goto(`${base}/tarifs`)],
      ['Centre d’aide', (page) => page.goto(`${base}/help`)],
      ['Se connecter', (page) => page.goto(`${base}/session/new`)],
    ],
  },
  {
    id: 'first_map',
    title: 'Créer sa première carte',
    steps: [
      ['Connexion', (page) => page.goto(`${base}/session/new`)],
      ['Lien demandé', async (page, ids) => {
        await page.getByLabel(t('sessions.new.email')).fill(ids.email('premiere-carte'))
        await page.getByRole('button', { name: t('sessions.new.send_link') }).click()
        await page.waitForURL(/sent=/)
      }],
      // The link from the e-mail: /dev/login stands in for it.
      ['Bienvenue', async (page, ids) => {
        await page.goto(`${base}/dev/login?email=${encodeURIComponent(ids.email('premiere-carte'))}&name=Alex`)
        await page.waitForLoadState('networkidle')
      }],
      ['Je conçois mon lieu', async (page) => {
        await page.locator('section[aria-labelledby="welcome-individual"] button').click()
        await page.waitForURL((url) => !url.pathname.startsWith('/welcome'))
      }],
      ['Nouvelle carte', (page) => page.goto(`${base}/maps/new`)],
      ['L’adresse du lieu', async (page) => {
        await page.getByLabel(t('maps.fields.name')).fill('Mon jardin-forêt')
        const address = page.getByPlaceholder(t('map_data.new.address_placeholder'))
        await address.fill('Purnode')
        await address.press('Enter')
        await page.getByRole('list', { name: t('map_data.search.results') }).getByRole('button').first().click()
      }],
      ['Le terrain ouvert', async (page) => {
        await page.getByRole('button', { name: t('maps.new.submit') }).click()
        await page.waitForURL(/\/maps\/\d+/)
        await page.waitForTimeout(3000)
      }],
    ],
  },
  {
    id: 'invite',
    title: 'Inviter quelqu’un',
    signIn: 'jardinier',
    steps: [
      ['La carte', async (page, ids) => {
        await page.goto(`${base}/maps/${ids.map}`)
        await page.waitForTimeout(3000)
      }],
      ['Partager', (page) => page.getByRole('button', { name: t('collab.share.button') }).first().click()],
      ['Invitation envoyée', async (page, ids) => {
        await page.getByLabel(t('collab.share.invite_email')).fill(ids.email('voisine'))
        await page.getByRole('button', { name: t('collab.share.invite_send') }).click()
        await page.waitForTimeout(1000)
      }],
      // The other side: the invited person opens the link of their e-mail.
      ['Le lien reçu', async (page, ids) => {
        await page.context().clearCookies()
        await page.goto(`${base}${ids.invitation}`)
      }],
      ['Invitée sur la carte', async (page, ids) => {
        await signIn(page, ids.email('invite'))
        await page.goto(`${base}${ids.invitation}`)
        await page.waitForTimeout(3000)
      }],
    ],
  },
  {
    id: 'pay',
    title: 'Payer',
    signIn: 'jardinier',
    steps: [
      ['Mes cartes', (page) => page.goto(`${base}/maps`)],
      ['Une deuxième carte', (page) => page.goto(`${base}/maps/new`)],
      ['La limite de la formule', async (page) => {
        await page.getByLabel(t('maps.fields.name')).fill('Le terrain de ma sœur')
        await page.getByRole('button', { name: t('maps.new.submit') }).click()
        await page.waitForURL((url) => url.pathname === '/maps' || url.pathname === '/billing')
      }],
      ['Formules', (page) => page.goto(`${base}/billing`)],
      // Stripe's own page is not replayed: the request that would leave for it
      // comes straight back, as after a payment.
      ['Vers le paiement', async (page) => {
        await page.route('**/billing/checkout', (route) => route.fulfill({
          status: 409, headers: { 'X-Inertia-Location': `${base}/billing?checkout=success` }, body: '',
        }))
        const home = page.locator('div').filter({ has: page.getByRole('heading', { name: t('billing.plans.yearly.name'), exact: true }) }).last()
        await home.getByRole('button', { name: t('billing.actions.choose') }).click()
      }],
      ['Retour après paiement', (page) => page.waitForURL(/checkout=success/)],
    ],
  },
  {
    id: 'plant',
    title: 'Planter au jardin',
    signIn: 'jardinier',
    steps: [
      ['Liste de plantation', async (page, ids) => {
        await page.goto(`${base}/maps/${ids.map}?panel=plant-list`)
        await page.waitForTimeout(3000)
      }],
      ['Un plant', async (page, ids) => {
        await page.goto(`${base}/maps/${ids.map}?feature=${ids.plant}`)
        await page.waitForTimeout(3000)
      }],
      ['Planté', async (page) => {
        await page.getByRole('button', { name: t('plant_feature.mark_planted') }).first().click()
        await page.waitForTimeout(1500)
      }],
    ],
  },
  {
    id: 'return',
    title: 'Revenir après trois mois',
    signIn: 'retour',
    steps: [
      ['Mes cartes', (page) => page.goto(`${base}/maps`)],
      ['Le jardin trois mois plus tard', async (page, ids) => {
        await page.goto(`${base}/maps/${ids.returnMap}`)
        await page.waitForTimeout(4000)
      }],
      ['Ce qui a poussé', async (page, ids) => {
        await page.goto(`${base}/maps/${ids.returnMap}?panel=plant-list`)
        await page.waitForTimeout(3000)
      }],
    ],
  },
]

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: devices['iPhone 13'],
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const report = { replayed_at: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null, journeys: [] }

for (const journey of JOURNEYS.filter((j) => !args.only || args.only.split(',').includes(j.id))) {
  const entry = { id: journey.id, title: journey.title, devices: {} }
  for (const [device, options] of Object.entries(DEVICES).filter(([name]) => !args.device || args.device === name)) {
    mkdirSync(join(out, journey.id), { recursive: true })
    const context = await browser.newContext({ ...options, locale: 'fr-BE', timezoneId: 'Europe/Brussels' })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    await page.route('**/geocode?*', (route) => route.fulfill({ json: { available: true, results: [PURNODE] } }))
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    // Each device has its own accounts (bin/rails journeys:prepare).
    const ids = { ...IDS[device], returnMap: IDS[device].return_map, email: (name) => `${name}-${device}@journeys.test` }
    if (journey.signIn) await signIn(page, ids.email(journey.signIn))

    const steps = []
    let failed = false
    for (const [index, [name, run]] of journey.steps.entries()) {
      if (failed) { steps.push({ name, status: 'skipped' }); continue }
      const file = join(journey.id, `${device}-${String(index + 1).padStart(2, '0')}.png`)
      const started = Date.now()
      errors.length = 0
      let error = null
      try {
        await run(page, ids)
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)
      } catch (e) {
        error = e.message.split('\n')[0]
        failed = true
      }
      await page.screenshot({ path: join(out, file) }).catch(() => undefined)
      steps.push({ name, status: error ? 'failed' : 'ok', error, url: page.url().replace(base, ''), screenshot: file,
                   seconds: Math.round((Date.now() - started) / 100) / 10, console_errors: [...new Set(errors)].slice(0, 5) })
    }
    entry.devices[device] = steps
    await context.close()
    const line = steps.map((s) => (s.status === 'ok' ? '✓' : s.status === 'failed' ? '✗' : '·')).join('')
    console.log(`${journey.id.padEnd(10)} ${device.padEnd(8)} ${line}${failed ? `  ${steps.find((s) => s.status === 'failed').name}: ${steps.find((s) => s.status === 'failed').error}` : ''}`)
  }
  report.journeys.push(entry)
}
await browser.close()

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
const broken = report.journeys.flatMap((j) => Object.values(j.devices).flat()).filter((s) => s.status === 'failed')
console.log(`\n${out}/report.json — ${broken.length ? `${broken.length} step(s) failed` : 'every step replayed'}`)
process.exit(broken.length ? 1 : 0)
