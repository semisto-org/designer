import { Droplet } from 'lucide-react'
import { Field, Select } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { saveFeature } from '@/map/drawing/save'
import { storedProperties } from '@/map/drawing/catalog'
import { useEditor } from '@/map/editor/EditorContext'
import { linkedSourceId, loadWaterSources, useWaterSources } from '@/map/water/store'
import type { MapFeature } from '@/types'

export { isLinkable as appliesToWaterSource } from '@/map/water/store'

/**
 * Inspector section of a tap: the water source feeding it, chosen among the
 * map's sources. A linked tap takes the source's potability (set by the
 * server), shown here instead of the tap's own checkbox.
 */
export default function WaterSourceSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const { sources } = useWaterSources(mapId)
  const sourceId = linkedSourceId(feature)
  const source = sources?.find((s) => s.id === sourceId) ?? null

  async function link(value: string) {
    const next = { ...storedProperties(feature) }
    if (value) next.water_source_id = Number(value)
    else delete next.water_source_id
    const saved = await saveFeature(editor, feature.properties.id, { properties: next })
    if (saved) void loadWaterSources(mapId, { force: true }) // tap counts
  }

  if (!sources) return null
  const manage = (
    <button type="button" onClick={() => editor.openPanel('water-sources')} className="text-xs text-prune-700 underline-offset-2 hover:underline">
      {t(sources.length === 0 ? 'water_sources.tap.add_first' : 'water_sources.tap.manage')}
    </button>
  )

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('water_sources.tap.title')}</h3>
      {sources.length === 0 ? (
        <p className="text-sm text-loam-500">{t('water_sources.tap.no_sources')}</p>
      ) : editor.canEdit ? (
        <Field label={t('water_sources.tap.source')}>
          <Select value={sourceId ?? ''} onChange={(e) => void link(e.target.value)}>
            <option value="">{t('water_sources.tap.none')}</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      ) : (
        <div className="flex justify-between gap-2 text-sm">
          <span className="text-loam-500">{t('water_sources.tap.source')}</span>
          <span className="text-right">{source?.name ?? t('water_sources.tap.none')}</span>
        </div>
      )}
      {source && (
        <p className="flex items-start gap-1.5 text-sm text-loam-700">
          <Droplet className={source.potable ? 'mt-0.5 h-4 w-4 shrink-0 text-leaf-600' : 'mt-0.5 h-4 w-4 shrink-0 text-humus-600'} />
          {t(source.potable ? 'water_sources.tap.potable' : 'water_sources.tap.not_potable', { name: source.name })}
        </p>
      )}
      {editor.canEdit && manage}
    </section>
  )
}
