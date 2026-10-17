import type { RootstockVigor } from '@/relief/growth'

/**
 * The rootstocks fruit trees are most often grafted on in Belgium, France,
 * Luxembourg and the Netherlands, and how vigorous each one is. Typing one
 * on a plant's sheet proposes its vigour.
 */
export const ROOTSTOCKS: readonly { name: string; genus: string; vigor: RootstockVigor }[] = [
  { name: 'M27', genus: 'Malus', vigor: 'very_dwarf' },
  { name: 'M9', genus: 'Malus', vigor: 'dwarf' },
  { name: 'M26', genus: 'Malus', vigor: 'semi_dwarf' },
  { name: 'M7', genus: 'Malus', vigor: 'semi_vigorous' },
  { name: 'MM106', genus: 'Malus', vigor: 'semi_vigorous' },
  { name: 'MM111', genus: 'Malus', vigor: 'vigorous' },
  { name: 'M25', genus: 'Malus', vigor: 'vigorous' },
  { name: 'Franc de pommier', genus: 'Malus', vigor: 'vigorous' },
  { name: 'Cognassier C', genus: 'Pyrus', vigor: 'dwarf' },
  { name: 'Cognassier A', genus: 'Pyrus', vigor: 'semi_dwarf' },
  { name: 'Pyrodwarf', genus: 'Pyrus', vigor: 'semi_dwarf' },
  { name: 'BA29', genus: 'Pyrus', vigor: 'semi_vigorous' },
  { name: 'Kirchensaller', genus: 'Pyrus', vigor: 'vigorous' },
  { name: 'Franc de poirier', genus: 'Pyrus', vigor: 'vigorous' },
  { name: 'Gisela 5', genus: 'Prunus', vigor: 'dwarf' },
  { name: 'Gisela 6', genus: 'Prunus', vigor: 'semi_dwarf' },
  { name: 'Colt', genus: 'Prunus', vigor: 'semi_vigorous' },
  { name: 'Maxma 14', genus: 'Prunus', vigor: 'semi_vigorous' },
  { name: 'Sainte-Lucie', genus: 'Prunus', vigor: 'vigorous' },
  { name: 'Merisier', genus: 'Prunus', vigor: 'vigorous' },
  { name: 'Pixy', genus: 'Prunus', vigor: 'dwarf' },
  { name: 'Wavit', genus: 'Prunus', vigor: 'semi_dwarf' },
  { name: 'Saint-Julien A', genus: 'Prunus', vigor: 'semi_vigorous' },
  { name: 'Myrobolan', genus: 'Prunus', vigor: 'vigorous' },
  { name: 'GF 677', genus: 'Prunus', vigor: 'vigorous' },
]

const key = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** A known rootstock by its name, forgiving case, accents, spaces and dots (« mm 106 », « M.9 »), or null. */
export function knownRootstock(value: string | null | undefined): (typeof ROOTSTOCKS)[number] | null {
  if (!value) return null
  const wanted = key(value)
  return wanted ? ROOTSTOCKS.find((r) => key(r.name) === wanted) ?? null : null
}

/** The rootstocks worth listing for a species: those of its genus first, then the others. */
export function rootstocksFor(latinName: string | null | undefined): (typeof ROOTSTOCKS)[number][] {
  const genus = latinName?.split(' ')[0]
  return [...ROOTSTOCKS].sort((a, b) => Number(b.genus === genus) - Number(a.genus === genus))
}
