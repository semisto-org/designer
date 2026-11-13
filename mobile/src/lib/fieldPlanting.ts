// « Planter »: what the person reads on the nursery label (species,
// cultivar, how the plant came) and when it goes into the ground. Pure
// logic, so it is tested without a phone.
import { normalize } from './species'
import type { Planting, Species } from './types'

/** How the plant comes from the nursery, kept on the plant as `nursery_form`. */
export const NURSERY_FORMS = ['bare_root', 'pot', 'root_ball'] as const
export type NurseryForm = (typeof NURSERY_FORMS)[number]

/**
 * When it goes in: still to plant (the plan for the planting day), today,
 * in a past year (planted before the map knew it), or long ago.
 */
export type PlantingWhen = { type: 'planned' } | { type: 'today' } | { type: 'year'; year: number } | { type: 'unknown' }

/** The years offered for a plant already in the ground: this one and the three before. */
export function pastYears(today: string): number[] {
  const year = Number(today.slice(0, 4))
  return [year, year - 1, year - 2, year - 3]
}

/** The plant's planting properties, as the website and the importers write them (a year alone is its 1st of January). */
export function plantingProperties(when: PlantingWhen, today: string): Record<string, string> {
  switch (when.type) {
    case 'planned': return {}
    case 'today': return { planted_on: today }
    case 'year': return { planted_on: `${when.year}-01-01`, planted_on_precision: 'year' }
    case 'unknown': return { planted_on: today, planted_on_precision: 'unknown' }
  }
}

/** A species of the catalogue, as /plants answers it. */
export type CatalogueSpecies = Species & { slug?: string; namedVarieties?: { id: number; name: string }[] }

/** The catalogue's answers the map doesn't already offer. */
export function catalogueOnly(results: CatalogueSpecies[], local: Species[]): CatalogueSpecies[] {
  const known = new Set(local.map((sp) => sp.id))
  return results.filter((sp) => !known.has(sp.id))
}

/**
 * Cultivars to offer under the name being typed: the ones of this map
 * first, then the catalogue's, without twins, matching what is typed.
 */
export function varietySuggestions(speciesId: number, planting: Pick<Planting, 'varieties'> | undefined, catalogue: { name: string }[], typed: string, limit = 8): string[] {
  const local = Object.values(planting?.varieties ?? {}).filter((v) => v.speciesId === speciesId).map((v) => v.name)
  const needle = normalize(typed.replace(/['‘’]/g, ''))
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of [...local, ...catalogue.map((v) => v.name)]) {
    const key = normalize(name)
    if (seen.has(key) || (needle && !key.includes(needle))) continue
    seen.add(key)
    out.push(name)
    if (out.length >= limit) break
  }
  return out
}

/** The cultivar as the label spells it, without the quotes nurseries put around it. */
export function cleanVariety(typed: string): string {
  return typed.trim().replace(/^['‘’"«\s]+|['‘’"»\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 120)
}
