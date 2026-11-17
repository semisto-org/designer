import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const home = parse(readFileSync(new URL('../../../config/locales/site.fr.yml', import.meta.url), 'utf8')).fr.site.home
const year = readFileSync(new URL('../../../app/frontend/components/site/home/Year.tsx', import.meta.url), 'utf8')

test('the home page opens on the address: the hero asks where the place is and names its button', () => {
  assert.equal(home.hero.title, 'Où est ton terrain ?')
  assert.ok(home.hero.submit)
  assert.ok(home.hero.appears.length >= 2)
})

test('every moment of the first year has an icon the component knows, and at least one goes outdoors', () => {
  const icons = [...year.matchAll(/(\w+): (?:Lamp|Footprints|PencilLine|Sprout)\b/g)].map((m) => m[1])
  for (const moment of home.year.moments) {
    assert.ok(icons.includes(moment.icon), `unknown icon ${moment.icon}`)
    assert.ok(moment.items.length > 0)
  }
  assert.ok(home.year.moments.some((m: { where: string }) => /dehors|sur ton terrain/.test(m.where)))
})
