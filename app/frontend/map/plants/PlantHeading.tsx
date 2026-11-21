import { BookOpen } from 'lucide-react'
import { formatDecimal, plantedLabel, plantedPrecision, strataLabel, todayIso } from '@/components/plants/format'
import { inWinter, wintersInGround } from '@/components/plants/specimen'
import { StrataPlate } from '@/components/plants/StrataPlate'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { GRAFTABLE_STRATA, graftProperty, numberProperty, TRAINABLE_STRATA, trainedCrown, trainingProperty } from '@/map/plants/properties'
import { usePlanting } from '@/map/plants/store'
import { plantStrata, STRATA_COLORS } from '@/map/plants/strata'
import { inkOn } from '@/map/plants/strataColors'
import type { MapFeature } from '@/types'

/**
 * Head of a plant's inspector, as a page of a naturalist's notebook: its
 * number on the plan, its name large, its Latin name, its strata painted
 * in watercolour, and how long it has lived in the ground.
 */
export default function PlantHeading({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { data } = usePlanting(editor.map.id)
  const p = feature.properties
  const speciesId = numberProperty(feature, 'species_id')
  const varietyId = numberProperty(feature, 'variety_id')
  const species = speciesId != null ? data?.species[String(speciesId)] : undefined
  const variety = varietyId != null ? data?.varieties[String(varietyId)] : undefined
  const strata = plantStrata(feature, data)
  const number = numberProperty(feature, 'number')
  const name = species ? species.commonName ?? species.latinName : p.name
  const latin = species?.latinName
  const training = trainingProperty(feature)
  const graft = strata != null && training === 'free' && GRAFTABLE_STRATA.includes(strata) ? graftProperty(feature, strata) : null
  const plantedOn = typeof p.planted_on === 'string' ? p.planted_on : null
  const precision = plantedPrecision(p.planted_on_precision)

  return (
    <header className="min-w-0">
      {number != null && (
        <span className="inline-block rounded-full bg-loam-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-loam-800"
          style={strata ? { background: STRATA_COLORS[strata], color: inkOn(STRATA_COLORS[strata]) } : undefined}>
          {number}
        </span>
      )}
      <div className="mt-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {name && (
            <h2 className="font-serif text-3xl leading-tight text-loam-900">
              {name}{variety && <span className="block text-2xl text-loam-700">‘{variety.name}’</span>}
            </h2>
          )}
          {latin && latin !== name && <p className="mt-0.5 text-sm italic text-loam-500">{latin}</p>}
        </div>
        {strata && <StrataPlate strata={strata} className="-mr-2 -mt-2 h-24 w-28 shrink-0" />}
      </div>
      {species && strata && (
        <p className="mt-1 text-sm text-loam-600">
          {strataLabel(strata)} · <span className="whitespace-nowrap">{t('plant_feature.crown', { value: formatDecimal(trainedCrown(species.crownM, training, strata, graft)) })}</span>
          {training !== 'free' && TRAINABLE_STRATA.includes(strata) && <span> ({t(`plant_feature.crown_${training}`)})</span>}
          {species.slug && (
            <a href={`/plants/${species.slug}`} target="_blank" rel="noreferrer" className="mt-0.5 flex w-fit items-center gap-1 text-prune-700 underline-offset-2 hover:underline">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />{t('plant_feature.specimen.species_sheet')}
            </a>
          )}
        </p>
      )}
      <PlantAge plantedOn={plantedOn} precision={precision} />
    </header>
  )
}

/** « Planté il y a 2 hivers », in the notebook's hand, with the exact date under it. */
function PlantAge({ plantedOn, precision }: { plantedOn: string | null; precision: 'year' | 'unknown' | null }) {
  if (!plantedOn) return <p className="mt-2 -rotate-1 font-hand text-xl leading-tight text-loam-500">{t('plant_feature.specimen.not_planted')}</p>
  const today = todayIso()
  const winters = wintersInGround(plantedOn, precision, today)
  const age = winters == null ? null
    : winters === 0 ? t(inWinter(today) ? 'plant_feature.specimen.first_winter_now' : 'plant_feature.specimen.first_winter_ahead')
      : t('plant_feature.specimen.winters', { count: winters })
  return (
    <div className="mt-2">
      {age && <p className="-rotate-1 font-hand text-xl leading-tight text-leaf-700">{age}</p>}
      <p className="text-sm text-loam-500">{plantedLabel(plantedOn, precision)}</p>
    </div>
  )
}
