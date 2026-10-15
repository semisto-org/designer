import { ExternalLink, Shovel } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatDate, formatDecimal, strataLabel, todayIso } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import ShapeEditButton from '@/map/drawing/ShapeEditButton'
import { useEditor } from '@/map/editor/EditorContext'
import { numberProperty, ownProperties } from '@/map/plants/properties'
import { usePlanting } from '@/map/plants/store'
import { StrataDot } from '@/map/plants/strata'
import type { MapFeature } from '@/types'

/** Inspector section of a plant: its species (from the palette), crown and planting date. */
export default function PlantSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { data } = usePlanting(editor.map.id)
  const [date, setDate] = useState(todayIso())
  const speciesId = numberProperty(feature, 'species_id')
  const varietyId = numberProperty(feature, 'variety_id')
  const number = numberProperty(feature, 'number')
  const plantedOn = typeof feature.properties.planted_on === 'string' ? feature.properties.planted_on : null
  const species = speciesId != null ? data?.species[String(speciesId)] : undefined
  const variety = varietyId != null ? data?.varieties[String(varietyId)] : undefined
  const palette = data?.palette ?? []
  const current = palette.find((i) => i.speciesId === speciesId && i.varietyId === varietyId)

  async function save(patch: Record<string, unknown>) {
    const properties = { ...ownProperties(feature), ...patch }
    Object.keys(properties).forEach((key) => properties[key] == null && delete properties[key])
    try {
      await editor.updateFeature(feature.properties.id, { properties })
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  function choose(value: string) {
    const item = palette.find((i) => String(i.id) === value)
    void save({ species_id: item?.speciesId ?? null, variety_id: item?.varietyId ?? null })
  }

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plant_feature.title')}</h3>
      {species ? (
        <div className="flex items-start gap-2">
          <StrataDot strata={current?.effectiveStrata ?? species.strata} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-loam-900">
              {variety ? variety.commonName ?? `${species.commonName ?? species.latinName} '${variety.name}'` : species.commonName ?? species.latinName}
            </p>
            <p className="text-xs italic text-loam-500">{variety?.latinName ?? species.latinName}</p>
            <p className="mt-1 text-xs text-loam-600">
              {strataLabel(current?.effectiveStrata ?? species.strata)} · {t('plant_feature.crown', { value: formatDecimal(species.crownM) })}
              {species.crownIndicative && <span className="text-loam-400"> ({t('plant_feature.crown_indicative')})</span>}
            </p>
          </div>
          <a href={`/plants/${species.slug}`} target="_blank" rel="noreferrer" className="rounded p-1 text-loam-400 hover:bg-loam-100" title={t('plant_feature.open_sheet')} aria-label={t('plant_feature.open_sheet')}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <p className="rounded-lg bg-humus-50 p-2 text-xs text-humus-700">{t('plant_feature.no_species')}</p>
      )}

      <ShapeEditButton feature={feature} />

      {editor.canEdit ? (
        <Field label={t('plant_feature.number')} hint={t('plant_feature.number_hint')}>
          <Input
            key={`${feature.properties.id}:${number ?? ''}`}
            type="number"
            min={1}
            inputMode="numeric"
            className="w-28"
            defaultValue={number ?? ''}
            onBlur={(e) => {
              const value = Number(e.target.value)
              if (Number.isInteger(value) && value > 0 && value !== number) void save({ number: value })
              else e.target.value = number != null ? String(number) : ''
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </Field>
      ) : number != null ? (
        <p className="text-loam-600">{t('plant_feature.number')} : <span className="font-medium tabular-nums text-loam-900">{number}</span></p>
      ) : null}

      {editor.canEdit && (
        palette.length === 0 ? (
          <p className="text-xs text-loam-500">{t('patches.palette_empty')}</p>
        ) : (
          <Field label={t('plant_feature.choose')}>
            <Select value={current ? String(current.id) : ''} onChange={(e) => choose(e.target.value)}>
              <option value="">{species && !current ? species.commonName ?? species.latinName : t('plant_feature.choose_placeholder')}</option>
              {palette.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
        )
      )}

      {plantedOn ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-leaf-50 p-2 text-xs text-leaf-800">
          <span className="inline-flex items-center gap-1.5"><Shovel className="h-4 w-4" />{t('plant_feature.planted_on', { date: formatDate(plantedOn) })}</span>
          {editor.canEdit && (
            <button type="button" className="text-leaf-700 underline" onClick={() => save({ planted_on: null })}>{t('plant_feature.unmark')}</button>
          )}
        </div>
      ) : editor.canEdit && speciesId != null ? (
        <div className="space-y-2">
          <Field label={t('plant_feature.planted_date')}>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button variant="leaf" size="sm" className="w-full" onClick={() => save({ planted_on: date }).then(() => editor.notify(t('plant_feature.planted')))}>
            <Shovel className="h-4 w-4" />{t('plant_feature.mark_planted')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
