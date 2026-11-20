import { Ruler } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { formatDate, formatDecimal } from '@/components/plants/format'
import { Field, Input } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { measuresProperty } from '@/map/plants/properties'
import type { MapFeature } from '@/types'

/** Strata whose plants are measured on site: trees and shrubs. */
export const MEASURED_STRATA: readonly string[] = ['canopy', 'sub_canopy', 'shrub']

/** The range each measure accepts (PlantableFeature::MEASURE_RANGES). */
const RANGES = { measured_height: [0.05, 80], crown_width: [0.05, 60], trunk_girth: [1, 2000] } as const
type Key = keyof typeof RANGES

/**
 * What someone measured on a tree or a shrub in the ground: trunk girth at
 * 1.30 m (a string round the trunk), height and crown width. The 3D view,
 * the shade and the time strip draw the plant at that size instead of the
 * catalogue's, and keep it growing from there.
 */
export default function PlantMeasures({ feature, strata, save }: {
  feature: MapFeature
  strata: string
  save: (patch: Record<string, unknown>) => Promise<void>
}) {
  const editor = useEditor()
  const measures = measuresProperty(feature)
  const tree = strata !== 'shrub'
  const values: Record<Key, number | null> = { measured_height: measures?.height ?? null, crown_width: measures?.crown ?? null, trunk_girth: measures?.girth ?? null }
  const keys: Key[] = tree ? ['trunk_girth', 'measured_height', 'crown_width'] : ['measured_height', 'crown_width']

  function commit(key: Key, raw: string, input: HTMLInputElement) {
    const text = raw.replace(',', '.').trim()
    const value = text === '' ? null : key === 'trunk_girth' ? Math.round(Number(text)) : Math.round(Number(text) * 100) / 100
    if (value === values[key]) return
    const [min, max] = RANGES[key]
    if (value !== null && !(Number.isFinite(value) && value >= min && value <= max)) {
      input.value = values[key] != null ? String(values[key]) : ''
      return
    }
    // A new measure is today's; the day goes away with the last measure.
    const others = keys.some((k) => k !== key && values[k] != null)
    void save({ [key]: value, measured_on: value === null && !others ? null : new Date().toISOString().slice(0, 10) })
  }

  const unit = (key: Key) => (key === 'trunk_girth' ? 'cm' : 'm')

  return (
    <div className="space-y-2 rounded-xl border border-loam-200 bg-loam-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-medium text-loam-900"><Ruler className="h-4 w-4 text-leaf-700" />{t('plant_feature.measures.title')}</p>
        <HelpButton slug="mesurer-un-arbre" iconOnly label={t('plant_feature.measures.help')} />
      </div>
      {editor.canEdit ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {keys.map((key) => (
              <Field key={key} label={t(`plant_feature.measures.${key}`)}>
                <Input
                  key={`${feature.properties.id}:${key}:${values[key] ?? ''}`}
                  type="number"
                  min={RANGES[key][0]}
                  max={RANGES[key][1]}
                  step={key === 'trunk_girth' ? 1 : 0.1}
                  inputMode="decimal"
                  defaultValue={values[key] ?? ''}
                  placeholder={unit(key)}
                  aria-label={t(`plant_feature.measures.${key}`)}
                  onBlur={(e) => commit(key, e.target.value, e.target)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
              </Field>
            ))}
          </div>
          {measures?.on ? (
            <p className="text-sm text-loam-600">{t('plant_feature.measures.measured_on', { date: formatDate(measures.on) })}</p>
          ) : (
            <HandNote tone="leaf">{t(tree ? 'plant_feature.measures.invite_tree' : 'plant_feature.measures.invite_shrub')}</HandNote>
          )}
        </>
      ) : measures ? (
        <p className="text-sm text-loam-700">
          {keys.filter((k) => values[k] != null).map((k) => t(`plant_feature.measures.value_${k}`, { value: formatDecimal(values[k]!) })).join(' · ')}
          {measures.on && <span className="text-loam-500"> ({t('plant_feature.measures.measured_on', { date: formatDate(measures.on) })})</span>}
        </p>
      ) : (
        <p className="text-sm text-loam-500">{t('plant_feature.measures.none')}</p>
      )}
      <p className="text-sm text-loam-500">{t('plant_feature.measures.hint')}</p>
    </div>
  )
}
