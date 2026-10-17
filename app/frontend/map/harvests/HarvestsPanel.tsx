import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { harvestsActions, useHarvests } from '@/map/harvests/store'
import { HarvestForm, harvestBody, plantLabel, SeasonDot, SeasonStrip, StatusLegend } from '@/map/harvests/shared'
import { visibleOffset } from '@/map/visiblePadding'
import type { HarvestInput, HarvestLogData, HarvestPlantRow } from '@/types/harvests'

type Filter = 'all' | 'unnoted' | 'watch'

/**
 * « Récoltes »: the fruit plants of the map, season after season. Tick the
 * trees picked the same day and note them in one go; open a tree for its
 * own sheet. The trees are ringed on the map in the season's colours while
 * the panel is open (HarvestsOverlay).
 */
export default function HarvestsPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { log, loading, error, mapId: loadedFor } = useHarvests()
  const [filter, setFilter] = useState<Filter>('all')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formKey, setFormKey] = useState(0)

  useEffect(() => { harvestsActions.load(mapId) }, [mapId])
  const current = loadedFor === mapId ? log : null
  const season = current?.season ?? new Date().getFullYear()
  const thisYear = new Date().getFullYear()

  const rows = useMemo(() => (current?.plants ?? []).filter((row) => {
    if (filter === 'unnoted') return !row.seasons[String(season)]
    if (filter === 'watch') return row.watch
    return true
  }), [current, filter, season])
  const groups = useMemo(() => groupBySpecies(rows), [rows])

  if (error) return <p className="text-sm text-clay-500">{t('plant_harvests.load_error')}</p>
  if (!current) return <p className="text-sm text-loam-400">{loading ? t('common.loading') : ''}</p>

  const toggle = (id: number) => setChecked((set) => { const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); return next })
  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.featureId))

  function focus(row: HarvestPlantRow) {
    const feature = editor.features.find((f) => f.properties.id === row.featureId)
    editor.select(row.featureId)
    if (feature?.geometry.type === 'Point') {
      editor.instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(editor.instance.getZoom(), 19), offset: visibleOffset(true) })
    }
  }

  async function saveBatch(input: HarvestInput) {
    setSaving(true)
    try {
      const r = await api<{ created: number; log: HarvestLogData }>(`/maps/${mapId}/harvests`, {
        method: 'POST', body: { feature_ids: [...checked], plant_harvest: harvestBody(input) },
      })
      harvestsActions.replace(mapId, r.log)
      editor.notify(t('plant_harvests.saved_many', { count: r.created }))
      setChecked(new Set())
      setErrors({})
      setFormKey((k) => k + 1)
    } catch (e) {
      if (e instanceof ApiError) setErrors((e.data.errors as Record<string, string[]>) ?? {})
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const totals = current.totals
  return (
    <div className="space-y-4 text-sm">
      <p className="text-sm text-loam-600">{t('plant_harvests.intro')}</p>

      <div className="flex items-center justify-between gap-2 rounded-2xl bg-loam-50 px-2 py-1.5">
        <button type="button" className="rounded-full p-1.5 text-loam-600 hover:bg-loam-100" aria-label={t('plant_harvests.previous_season')} onClick={() => harvestsActions.load(mapId, season - 1)}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="font-serif text-xl text-loam-900">{t('plant_harvests.season', { year: season })}</p>
          {totals.plants > 0 && (
            <p className="text-sm text-loam-600">
              {t('plant_harvests.totals', { picked: totals.picked, bore: totals.bore, none: totals.none, unnoted: totals.unnoted })}
            </p>
          )}
          {totals.quantityKg != null && (
            <p className="text-sm text-loam-600">{t('plant_harvests.total_kg', { value: totals.quantityKg.toLocaleString('fr-BE') })}</p>
          )}
        </div>
        <button type="button" className="rounded-full p-1.5 text-loam-600 hover:bg-loam-100 disabled:opacity-30" aria-label={t('plant_harvests.next_season')} disabled={season >= thisYear} onClick={() => harvestsActions.load(mapId, season + 1)}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {totals.plants === 0 ? (
        <p className="rounded-2xl border border-dashed border-loam-300 p-3 text-sm text-loam-600">{t('plant_harvests.empty_map')}</p>
      ) : (<>
        <StatusLegend />
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'unnoted', 'watch'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
              className={clsx('rounded-full px-3 py-1 text-sm ring-1 ring-inset', filter === value ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-100')}>
              {t(`plant_harvests.filters.${value}`)}
              {value === 'watch' && totals.watch > 0 && <span className="ml-1 tabular-nums">{totals.watch}</span>}
              {value === 'unnoted' && totals.unnoted > 0 && <span className="ml-1 tabular-nums">{totals.unnoted}</span>}
            </button>
          ))}
        </div>
        {filter === 'watch' && <p className="text-sm text-loam-600">{t('plant_harvests.watch_hint', { count: current.watchSeasons })}</p>}

        {editor.canEdit && rows.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-loam-700">
            <input type="checkbox" className="h-4 w-4 accent-prune-600" checked={allChecked}
              onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.featureId)))} />
            {allChecked ? t('plant_harvests.select_none') : t('plant_harvests.select_all')}
          </label>
        )}

        {rows.length === 0 ? <p className="text-sm text-loam-500">{t('plant_harvests.empty_filter')}</p> : (
          <div className="space-y-3">
            {groups.map((group) => (
              <section key={group.key}>
                <h3 className="mb-1 text-sm font-semibold text-loam-600">{group.title}</h3>
                <ul className="divide-y divide-loam-100">
                  {group.rows.map((row) => (
                    <li key={row.featureId} className="flex items-start gap-2 py-2">
                      {editor.canEdit && (
                        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-prune-600" checked={checked.has(row.featureId)}
                          onChange={() => toggle(row.featureId)} aria-label={plantLabel(row)} />
                      )}
                      <button type="button" onClick={() => focus(row)} className="min-w-0 flex-1 text-left">
                        <span className={clsx('block text-loam-800 hover:underline', editor.selectedId === row.featureId && 'font-medium text-prune-700')}>{plantLabel(row)}</span>
                        <span className="mt-1 block"><SeasonStrip row={row} seasons={current.seasons.slice(0, -1)} size="sm" /></span>
                        {row.watch && <span className="mt-0.5 block text-sm text-humus-700">{t('plant_harvests.watch', { count: row.quietSeasons })}</span>}
                      </button>
                      <SeasonDot summary={row.seasons[String(season)]} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </>)}

      {editor.canEdit && checked.size > 0 && (
        <div className="sticky bottom-0 space-y-2 border-t border-loam-200 bg-white pt-3">
          <p className="font-medium text-loam-900">{t('plant_harvests.batch_title')} · {t('plant_harvests.selected', { count: checked.size })}</p>
          <HarvestForm key={formKey} withWeight={false} saving={saving} errors={errors} onSubmit={saveBatch} onCancel={() => setChecked(new Set())} />
        </div>
      )}
    </div>
  )
}

/** Rows grouped by species, then variety, in the log's order. */
function groupBySpecies(rows: HarvestPlantRow[]) {
  const groups: { key: string; title: string; rows: HarvestPlantRow[] }[] = []
  for (const row of rows) {
    const key = String(row.speciesId ?? 'none')
    let group = groups.find((g) => g.key === key)
    if (!group) groups.push(group = { key, title: row.speciesName ?? t('plant_harvests.no_species'), rows: [] })
    group.rows.push(row)
  }
  return groups
}
