import { useEditor } from '@/map/editor/EditorContext'
import { numberProperty } from '@/map/plants/properties'
import { usePlanting } from '@/map/plants/store'
import { plantStrata, STRATA_COLORS } from '@/map/plants/strata'
import { inkOn } from '@/map/plants/strataColors'
import type { MapFeature } from '@/types'

/** Heading of a plant's inspector: its number on the plan and its species (and variety). */
export default function PlantHeading({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { data } = usePlanting(editor.map.id)
  const speciesId = numberProperty(feature, 'species_id')
  const varietyId = numberProperty(feature, 'variety_id')
  const species = speciesId != null ? data?.species[String(speciesId)] : undefined
  const variety = varietyId != null ? data?.varieties[String(varietyId)] : undefined
  const strata = plantStrata(feature, data)
  const number = numberProperty(feature, 'number')
  const name = species ? species.commonName ?? species.latinName : feature.properties.name

  return (
    <div className="flex items-center gap-2">
      {number != null && (
        <span className="rounded-full bg-loam-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-loam-800"
          style={strata ? { background: STRATA_COLORS[strata], color: inkOn(STRATA_COLORS[strata]) } : undefined}>
          {number}
        </span>
      )}
      {name && (
        <h2 className="font-serif text-lg leading-snug text-loam-900">
          {name}{variety && <span className="text-loam-700"> ‘{variety.name}’</span>}
        </h2>
      )}
    </div>
  )
}
