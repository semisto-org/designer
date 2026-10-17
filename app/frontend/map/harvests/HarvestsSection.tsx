import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/components/plants/format'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { AdviceCard } from '@/map/harvests/AdviceCard'
import { harvestsActions } from '@/map/harvests/store'
import { HarvestForm, harvestBody, SeasonDot, SeasonStrip } from '@/map/harvests/shared'
import type { MapFeature } from '@/types'
import type { HarvestInput, PlantHarvest, PlantHarvestsData } from '@/types/harvests'

/**
 * « Récoltes » on a fruit plant's sheet: its seasons side by side, what was
 * seen and picked, and the line to add. Hidden for plants that give no
 * fruit (herbs, ground cover) unless someone already noted a harvest.
 */
export default function HarvestsSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const base = `/maps/${mapId}/features/${feature.properties.id}/plant_harvests`
  const [data, setData] = useState<PlantHarvestsData | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    api<PlantHarvestsData>(base, { signal: controller.signal }).then(setData).catch(() => undefined)
    return () => controller.abort()
  }, [base])

  if (!data?.plant) return null
  const row = data.plant

  async function save(input: HarvestInput) {
    setSaving(true)
    try {
      setData(await api<PlantHarvestsData>(base, { method: 'POST', body: { plant_harvest: harvestBody(input) } }))
      setAdding(false)
      setErrors({})
      editor.notify(t('plant_harvests.saved'))
      harvestsActions.refresh(mapId)
    } catch (e) {
      if (e instanceof ApiError) setErrors((e.data.errors as Record<string, string[]>) ?? {})
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(harvest: PlantHarvest) {
    if (!window.confirm(t('plant_harvests.confirm_delete'))) return
    try {
      setData(await api<PlantHarvestsData>(`${base}/${harvest.id}`, { method: 'DELETE' }))
      editor.notify(t('plant_harvests.deleted'))
      harvestsActions.refresh(mapId)
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plant_harvests.title')}</h3>
      <div className="space-y-1.5">
        <SeasonStrip row={row} seasons={data.seasons} labels />
        <p className="text-sm text-loam-600">
          {row.bearingFrom && row.bearingFrom > new Date().getFullYear()
            ? t('plant_harvests.bearing_from', { year: row.bearingFrom })
            : row.lastBore ? t('plant_harvests.last_bore', { year: row.lastBore }) : t('plant_harvests.never_bore')}
        </p>
        {row.watch && (
          <p className="rounded-xl bg-humus-50 p-2 text-sm text-loam-800 ring-1 ring-inset ring-humus-200">
            <strong className="font-medium">{t('plant_harvests.watch', { count: row.quietSeasons })}</strong>
            <br />{t('plant_harvests.watch_hint', { count: data.watchSeasons })}
          </p>
        )}
      </div>
      {data.advice && <AdviceCard advice={data.advice} />}
      {data.harvests.length === 0
        ? <p className="text-sm text-loam-500">{t('plant_harvests.empty')}</p>
        : (
          <ul className="space-y-1.5">
            {data.harvests.map((h) => (
              <li key={h.id} className="flex items-start gap-2 rounded-xl bg-loam-50 p-2">
                <SeasonDot summary={{ status: h.stage === 'picked' ? 'picked' : h.amount === 'none' ? 'none' : 'bore', amount: h.amount, uses: h.uses, quantityKg: h.quantityKg }} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-loam-800">
                    <span className="font-medium">{formatDate(h.notedOn)}</span>
                    {' · '}{t(`plant_harvests.stages.${h.stage}`)}
                    {h.amount && <> · {t(`plant_harvests.amounts.${h.stage}.${h.amount}`)}</>}
                    {h.quantityKg != null && <> · {t('plant_harvests.kg', { value: h.quantityKg.toLocaleString('fr-BE') })}</>}
                  </p>
                  {h.uses.length > 0 && <p className="text-loam-600">{h.uses.map((u) => t(`plant_harvests.uses.${u}`)).join(', ')}</p>}
                  {h.note && <p className="whitespace-pre-line text-loam-600">{h.note}</p>}
                  {h.author && <p className="text-loam-400">{t('plant_harvests.by', { name: h.author })}</p>}
                </div>
                {editor.canEdit && (
                  <button type="button" onClick={() => remove(h)} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('plant_harvests.delete')} title={t('plant_harvests.delete')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      {editor.canEdit && (adding
        ? <HarvestForm withWeight saving={saving} errors={errors} onSubmit={save} onCancel={() => { setAdding(false); setErrors({}) }} />
        : <Button variant="secondary" size="sm" className="w-full" onClick={() => setAdding(true)}>{t('plant_harvests.add')}</Button>)}
    </section>
  )
}
