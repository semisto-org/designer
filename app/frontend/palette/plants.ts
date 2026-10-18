// The « Plant par plant » table of the « Palette végétale », without React:
// one line per plant point of the map (PlantPalette#plants), the filters and
// how a typed planting date becomes the plant's properties. The page draws
// it with palette/PlantsTable.tsx.

export type PlantLine = {
  id: number
  number: number | null
  name: string | null
  /** The species row of the palette (« 12- »), null for a plant without species. */
  key: string | null
  species: string | null
  plantedOn: string | null
  /** `planted_on_precision`: null for the exact day. */
  plantedPrecision: 'year' | 'unknown' | null
  tags: string[]
  lockVersion: number
}

export type PlantFilters = { search: string; status: '' | 'planned' | 'planted'; tag: string }

/** The properties a planting date typed in the table gives the plant. */
export type PlantedPatch = { planted_on: string; planted_on_precision: 'year' | 'unknown' | null }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr')

export function filterPlants(plants: PlantLine[], filters: PlantFilters): PlantLine[] {
  const words = fold(filters.search.trim()).split(/\s+/).filter(Boolean)
  const tag = fold(filters.tag)
  return plants.filter((plant) => {
    if (filters.status === 'planned' && plant.plantedOn) return false
    if (filters.status === 'planted' && !plant.plantedOn) return false
    if (tag && !plant.tags.some((t) => fold(t) === tag)) return false
    if (words.length === 0) return true
    // A number finds that plant, not every number that contains it (12, not 120).
    const haystack = fold([plant.species ?? '', plant.name ?? '', ...plant.tags].join(' '))
    return words.every((word) => (/^\d+$/.test(word) && String(plant.number) === word) || haystack.includes(word))
  })
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * « 2015 » (the year only), « 12/03/2024 » or « 2024-03-12 » (the day), or
 * nothing (in the ground since a date nobody knows, recorded on `today`).
 * Undefined when the text is not a date, or is in the future.
 */
export function parsePlanted(text: string, today: string): PlantedPatch | undefined {
  const value = text.trim()
  if (value === '') return { planted_on: today, planted_on_precision: 'unknown' }
  let iso: string | null = null
  let precision: PlantedPatch['planted_on_precision'] = null
  const year = value.match(/^(\d{4})$/)
  const french = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  const isoDay = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (year) {
    iso = `${year[1]}-01-01`
    precision = 'year'
  } else if (french) {
    iso = `${french[3]}-${pad(Number(french[2]))}-${pad(Number(french[1]))}`
  } else if (isoDay) {
    iso = `${isoDay[1]}-${pad(Number(isoDay[2]))}-${pad(Number(isoDay[3]))}`
  }
  if (!iso) return undefined
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (y < 1800 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined
  if (iso > today) return undefined
  return { planted_on: iso, planted_on_precision: precision }
}

/** What the planting date field shows to edit: « 2015 », « 12/03/2024 » or empty. */
export function plantedInput(plant: Pick<PlantLine, 'plantedOn' | 'plantedPrecision'>): string {
  if (!plant.plantedOn || plant.plantedPrecision === 'unknown') return ''
  if (plant.plantedPrecision === 'year') return plant.plantedOn.slice(0, 4)
  const [y, m, d] = plant.plantedOn.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
