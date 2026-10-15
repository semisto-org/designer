/**
 * Which plant names the map writes, and in which order. On arrival the map
 * names what structures the place (zones, the pond, big trees); shrubs and
 * small plants are named as one zooms in. When two names collide, the
 * bigger crown keeps its name.
 */

/** Zoom from which a plant's name shows, by its adult crown (metres). */
export function plantLabelZoom(crownM: number | null | undefined): number {
  if (crownM == null || !Number.isFinite(crownM)) return 19
  if (crownM >= 6) return 17
  if (crownM >= 2) return 18
  return 19
}

/** MapLibre places the lowest `symbol-sort-key` first: big crowns first. */
export function plantLabelRank(crownM: number | null | undefined): number {
  return crownM != null && Number.isFinite(crownM) ? -crownM : 0
}

/**
 * How plants are named on the map: their name, the short latin code, or
 * their number alone, written in their point (the legend then lists them).
 */
export type PlantLabelStyle = 'name' | 'code' | 'number'

/**
 * The first two letters of the genus and of the species, as designers write
 * them on a plan: Malus domestica → « Ma do ». Hybrid signs and
 * abbreviations (×, x, subsp., var.) are skipped.
 */
export function plantCode(latinName: string | null | undefined): string | null {
  const words = (latinName ?? '').split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w) && w !== 'x' && w !== '×' && !w.endsWith('.'))
  if (words.length === 0) return null
  const genus = words[0].slice(0, 2)
  const species = words[1]?.replace(/^['"]/, '').slice(0, 2).toLowerCase()
  return species ? `${genus[0].toUpperCase()}${genus.slice(1).toLowerCase()} ${species}` : genus[0].toUpperCase() + genus.slice(1).toLowerCase()
}

/** A plant's name without the number already written in front of it (« 27 · Toona » → « Toona »). */
export function withoutNumber(name: string): string {
  return name.replace(/^\s*\d{1,6}\s*\??\s*[·.\-–:]\s*/, '').trim()
}

type LabelInput = {
  number?: number | null
  ownName?: string | null
  speciesName?: string | null
  varietyName?: string | null
  latinName?: string | null
}

/** « 12 · Pommier 'Reinette' » or « 12 · Ma do »; the number alone when nothing else is known. */
export function plantLabelText(input: LabelInput, style: PlantLabelStyle): string | null {
  const own = input.ownName ? withoutNumber(input.ownName) : ''
  const name = own || (input.speciesName ? (input.varietyName ? `${input.speciesName} '${input.varietyName}'` : input.speciesName) : '')
  const text = style === 'code' ? plantCode(input.latinName) ?? name : name
  if (input.number != null && input.number > 0) return text ? `${input.number} · ${text}` : String(input.number)
  return text || null
}

/** Plant numbers as a plan legend writes them: « 3, 5–7, 12 ». */
export function numberRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    parts.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join(', '))
    i = j
  }
  return parts.join(', ')
}
