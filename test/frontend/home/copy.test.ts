import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const home = parse(readFileSync(new URL('../../../config/locales/site.fr.yml', import.meta.url), 'utf8')).fr.site.home
const year = readFileSync(new URL('../../../app/frontend/components/site/home/Year.tsx', import.meta.url), 'utf8')

test('the first screen names what Terranova is for, with « jardin-forêt » as its key word, and keeps the address as the way in', () => {
  assert.ok(home.hero.title.includes('jardin-forêt'), 'the title must contain the keyword as written')
  assert.match(home.hero.title, /^Conçois/)
  assert.match(home.hero.title, /suis/)
  assert.ok(home.hero.what.body.includes('arbustes'))
  assert.ok(home.hero.submit)
  assert.ok(home.hero.label.includes('adresse'))
})

test('the example photo names the layers of a forest garden', () => {
  for (const key of ['trees', 'shrubs', 'herbs', 'pond', 'garden']) assert.ok(home.hero.photo[key], `missing note ${key}`)
})

test('every moment of the first year has an icon the component knows, and at least one goes outdoors', () => {
  const icons = [...year.matchAll(/(\w+): (?:Lamp|Footprints|PencilLine|Sprout)\b/g)].map((m) => m[1])
  for (const moment of home.year.moments) {
    assert.ok(icons.includes(moment.icon), `unknown icon ${moment.icon}`)
    assert.ok(moment.items.length > 0)
  }
  assert.ok(home.year.moments.some((m: { where: string }) => /dehors|sur ton terrain/.test(m.where)))
})
