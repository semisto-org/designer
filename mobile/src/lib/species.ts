// Choosing a species on the terrain.
import type { Planting, Species } from './types'

/** The palette first, then the other species the map knows, filtered by name. */
export function speciesChoices(planting: Pick<Planting, 'species' | 'palette'> | undefined, query: string): Species[] {
  if (!planting) return []
  const all = Object.values(planting.species)
  const inPalette = new Set(planting.palette.map((p) => p.speciesId))
  const needle = normalize(query)
  return all
    .filter((sp) => !needle || normalize(`${sp.commonName ?? ''} ${sp.latinName}`).includes(needle))
    .sort((a, b) => Number(inPalette.has(b.id)) - Number(inPalette.has(a.id)) || (a.commonName ?? a.latinName).localeCompare(b.commonName ?? b.latinName, 'fr'))
}

export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

