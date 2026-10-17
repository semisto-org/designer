// Search inside a map's palette, and how a catalogue species stands against
// the terrain's winter. Pure functions, tested in test/frontend/plants.

type Searchable = {
  name: string
  latinName: string
  species: { commonName: string | null; latinName: string }
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Every word of the query appears in one of the item's names, accents and case aside. */
export function matchesPalette(item: Searchable, query: string): boolean {
  const words = fold(query).split(/[\s'’-]+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fold([item.name, item.latinName, item.species.commonName ?? '', item.species.latinName].join(' '))
  return words.every((w) => haystack.includes(w))
}

export type Hardiness = 'fits' | 'misfit' | 'unknown'

/** A species hardy to zone N survives the winters of zone N and of the milder zones above it. */
export function hardinessHere(speciesZone: number | null, siteZone: number | null): Hardiness {
  if (speciesZone == null || siteZone == null) return 'unknown'
  return speciesZone <= siteZone ? 'fits' : 'misfit'
}

const RANK: Record<Hardiness, number> = { fits: 0, unknown: 1, misfit: 2 }

/** Hardy species first, then unknown hardiness, then too tender; the catalogue's order otherwise. */
export function byHardiness<T extends { hardinessZone: number | null }>(items: T[], siteZone: number | null): T[] {
  return items
    .map((item, index) => ({ item, index, rank: RANK[hardinessHere(item.hardinessZone, siteZone)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item)
}
