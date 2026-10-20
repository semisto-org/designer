import type { MapFeature } from '@/types'
import type { PlantingState, Strata } from '@/types/plants'
import { isSupportPlant, numberProperty } from '@/map/plants/properties'
import { STRATA_COLORS } from '@/map/plants/strataColors'

export { drawsCrown, STRATA_COLORS, strataCounts, type StrataCount } from '@/map/plants/strataColors'

export function StrataDot({ strata, className = '' }: { strata: Strata; className?: string }) {
  return <span className={'inline-block h-2.5 w-2.5 shrink-0 rounded-full ' + className} style={{ background: STRATA_COLORS[strata] }} aria-hidden />
}

/**
 * The strata a plant plays on this map: its palette line's (variety first,
 * then species), else its species'. Null while the planting data is loading.
 */
export function plantStrata(feature: MapFeature, data: PlantingState | null): Strata | null {
  const speciesId = numberProperty(feature, 'species_id')
  const species = speciesId != null ? data?.species[String(speciesId)] : undefined
  if (!species) return null
  return paletteItemOf(feature, data)?.effectiveStrata ?? species.strata
}

/** A plant's line in the palette: its cultivar's, else its species'. */
export function paletteItemOf(feature: MapFeature, data: PlantingState | null) {
  const speciesId = numberProperty(feature, 'species_id')
  if (speciesId == null) return undefined
  const varietyId = numberProperty(feature, 'variety_id')
  return data?.palette.find((i) => i.speciesId === speciesId && i.varietyId === varietyId) ??
    data?.palette.find((i) => i.speciesId === speciesId && i.varietyId == null)
}

/** Whether a plant is a support plant, from its sheet or its palette role. */
export function plantIsSupport(feature: MapFeature, data: PlantingState | null): boolean {
  return isSupportPlant(feature, paletteItemOf(feature, data)?.role)
}
