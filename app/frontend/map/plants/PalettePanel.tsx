import { ExternalLink, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { strataLabel } from '@/components/plants/format'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { setPlacing, setPlanting, usePlanting } from '@/map/plants/store'
import { STRATA_COLORS, StrataDot } from '@/map/plants/strata'
import {
  STRATA, type PaletteItem, type PaletteRole, type PaletteSuggestion, type PlantSearchResult, type PlantingState,
  type SpeciesSummary, type Strata,
} from '@/types/plants'

const ROLES: PaletteRole[] = ['food', 'support', 'pioneer', 'hedge', 'ornamental']

/**
 * « Palette » panel: the species chosen for this terrain. Search the
 * catalogue (hardy here by default), start from suggestions, place plants
 * on the map, draw a patch, and watch the strata balance.
 */
export default function PalettePanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data, error, placing } = usePlanting(mapId)
  const [query, setQuery] = useState('')
  const [hardyOnly, setHardyOnly] = useState(true)
  const [results, setResults] = useState<SpeciesSummary[] | null>(null)
  const [suggestions, setSuggestions] = useState<PaletteSuggestion[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const zone = data?.zone ?? null

  const paletteSpecies = useMemo(() => new Set(data?.palette.filter((i) => !i.varietyId).map((i) => i.speciesId)), [data])
  const paletteSize = data?.palette.length ?? 0

  // Catalogue search, debounced.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q })
      if (hardyOnly && zone) params.set('zone', String(zone))
      if (data?.country) params.set('country', data.country)
      api<PlantSearchResult>(`/plants?${params}`, { signal: controller.signal })
        .then((r) => setResults(r.results.slice(0, 12)))
        .catch(() => undefined)
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, hardyOnly, zone, data?.country])

  // Suggestions, refreshed when the palette changes.
  useEffect(() => {
    if (!editor.canEdit) return
    const controller = new AbortController()
    api<{ suggestions: PaletteSuggestion[] }>(`/maps/${mapId}/palette_items/suggestions`, { signal: controller.signal })
      .then((r) => setSuggestions(r.suggestions))
      .catch(() => undefined)
    return () => controller.abort()
  }, [mapId, paletteSize, editor.canEdit])

  async function add(species: SpeciesSummary) {
    try {
      const r = await api<{ item: PaletteItem; planting: PlantingState }>(`/maps/${mapId}/palette_items`, {
        method: 'POST', body: { palette_item: { species_id: species.id } },
      })
      setPlanting(mapId, r.planting)
      editor.notify(t('palette.added', { name: species.commonName ?? species.latinName }))
    } catch (e) {
      editor.notify(e instanceof ApiError ? e.message : t('palette.load_error'), 'error')
    }
  }

  async function remove(item: PaletteItem) {
    if (!window.confirm(t('palette.confirm_remove', { name: item.name }))) return
    try {
      const r = await api<{ planting: PlantingState }>(`/maps/${mapId}/palette_items/${item.id}`, { method: 'DELETE' })
      setPlanting(mapId, r.planting)
      if (placing?.id === item.id) setPlacing(null)
      editor.notify(t('palette.removed', { name: item.name }))
    } catch (e) {
      editor.notify(e instanceof ApiError ? e.message : t('palette.load_error'), 'error')
    }
  }

  function place(item: PaletteItem) {
    if (placing?.id === item.id) { setPlacing(null); editor.cancelDraw(); return }
    setPlacing(item)
    // On a phone the panel covers the map: get it out of the way.
    if (window.matchMedia('(max-width: 767px)').matches) editor.openPanel(null)
  }

  async function drawPatch() {
    editor.notify(t('palette.drawing_patch'))
    const geometry = await editor.draw('polygon')
    if (!geometry) return
    try {
      const feature = await editor.createFeature({ layer: 'plants', kind: 'patch', geometry, properties: {} })
      editor.select(feature.properties.id)
      editor.notify(t('palette.patch_created'))
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  if (error) return <p className="text-sm text-clay-500">{t('palette.load_error')}</p>
  if (!data) return <p className="text-sm text-loam-400">{t('common.loading')}</p>

  const groups = STRATA.map((strata) => ({ strata, items: data.palette.filter((i) => i.effectiveStrata === strata) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="space-y-5 text-sm">
      <p className="text-xs text-loam-500">{t('palette.intro')}</p>
      {!editor.canEdit && <p className="rounded-lg bg-loam-50 p-2 text-xs text-loam-600">{t('palette.read_only')}</p>}

      {editor.canEdit && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('palette.search_placeholder')}
              aria-label={t('palette.search_placeholder')}
              className="pl-9"
            />
          </div>
          {zone ? (
            <label className="flex items-center gap-2 text-xs text-loam-600">
              <input type="checkbox" checked={hardyOnly} onChange={() => setHardyOnly(!hardyOnly)} className="rounded border-loam-300 text-prune-600 focus:ring-prune-500" />
              {t('palette.hardy_only', { zone })}
            </label>
          ) : (
            <p className="text-xs text-loam-400">{t('palette.zone_unknown')}</p>
          )}
          {results && (
            results.length === 0
              ? <p className="text-xs text-loam-400">{t('palette.results_empty')}</p>
              : <SpeciesList items={results} inPalette={paletteSpecies} onAdd={add} />
          )}
          {!results && suggestions.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-loam-500">{t('palette.suggestions')}</h3>
              <SpeciesList items={suggestions} inPalette={paletteSpecies} onAdd={add} reasons />
            </div>
          )}
        </div>
      )}

      <section>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-loam-300 p-3 text-xs text-loam-500">{t('palette.empty')}</p>
        ) : (
          <div className="space-y-3">
            {groups.map(({ strata, items }) => (
              <div key={strata}>
                <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
                  <StrataDot strata={strata} />{strataLabel(strata)}
                </h3>
                <ul className="divide-y divide-loam-100">
                  {items.map((item) => (
                    <li key={item.id} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-loam-800">{item.name}</p>
                          <p className="truncate text-xs text-loam-500">
                            <i>{item.latinName}</i> · {t('palette.placed_count', { count: item.planned })}
                            {item.targetCount ? ` · ${t('palette.target', { count: item.targetCount })}` : ''}
                          </p>
                        </div>
                        {editor.canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => place(item)}
                              title={t('palette.place_title', { name: item.name })}
                              aria-pressed={placing?.id === item.id}
                              className={'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ' + (placing?.id === item.id ? 'bg-leaf-600 text-white' : 'bg-leaf-50 text-leaf-700 hover:bg-leaf-100')}
                            >
                              <MapPin className="h-3.5 w-3.5" />{t('palette.place')}
                            </button>
                            <button type="button" onClick={() => setEditing(editing === item.id ? null : item.id)} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('palette.edit')} title={t('palette.edit')}>
                              {editing === item.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                            </button>
                          </>
                        )}
                      </div>
                      {editing === item.id && <PaletteItemForm item={item} onRemove={() => remove(item)} onDone={() => setEditing(null)} />}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <StrataBalance totals={data.strata} />

      {editor.canEdit && (
        <Button variant="secondary" size="sm" className="w-full" onClick={drawPatch} disabled={editor.drawing}>
          <Plus className="h-4 w-4" />{t('palette.draw_patch')}
        </Button>
      )}
    </div>
  )
}

function SpeciesList({ items, inPalette, onAdd, reasons }: {
  items: (SpeciesSummary & { reason?: string })[]; inPalette: Set<number>; onAdd: (s: SpeciesSummary) => void; reasons?: boolean
}) {
  return (
    <ul className="max-h-64 divide-y divide-loam-100 overflow-y-auto rounded-lg ring-1 ring-loam-200">
      {items.map((s) => (
        <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
          <StrataDot strata={s.strata} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-loam-800">{s.commonName ?? s.latinName}</p>
            <p className="truncate text-xs text-loam-500">
              {reasons && s.reason ? t(`palette.reasons.${s.reason}`) : <i>{s.latinName}</i>}
              {s.hardinessZone ? ` · ${t('plants.card.zone', { zone: s.hardinessZone })}` : ''}
            </p>
          </div>
          <a href={`/plants/${s.slug}`} target="_blank" rel="noreferrer" className="rounded p-1 text-loam-400 hover:bg-loam-100" title={t('palette.open_sheet')} aria-label={t('palette.open_sheet')}>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {inPalette.has(s.id) ? (
            <span className="text-xs text-leaf-700">{t('palette.in_palette')}</span>
          ) : (
            <button type="button" onClick={() => onAdd(s)} className="rounded-md bg-prune-50 p-1 text-prune-700 hover:bg-prune-100" title={t('palette.add')} aria-label={t('palette.add')}>
              <Plus className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function PaletteItemForm({ item, onRemove, onDone }: { item: PaletteItem; onRemove: () => void; onDone: () => void }) {
  const editor = useEditor()
  const [strata, setStrata] = useState<string>(item.strata ?? '')
  const [role, setRole] = useState<string>(item.role ?? '')
  const [target, setTarget] = useState<string>(item.targetCount ? String(item.targetCount) : '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  async function save() {
    try {
      const r = await api<{ planting: PlantingState }>(`/maps/${editor.map.id}/palette_items/${item.id}`, {
        method: 'PATCH',
        body: { palette_item: { strata: strata || null, role: role || null, target_count: target ? Number(target) : null, notes } },
      })
      setPlanting(editor.map.id, r.planting)
      onDone()
    } catch (e) {
      if (e instanceof ApiError) setErrors((e.data.errors as Record<string, string[]>) ?? {})
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-loam-50 p-2">
      <Field label={t('palette.strata')} error={errors.strata}>
        <Select value={strata} onChange={(e) => setStrata(e.target.value)}>
          <option value="">{t('palette.strata_default', { strata: strataLabel(item.species.strata) })}</option>
          {STRATA.map((s) => <option key={s} value={s}>{strataLabel(s)}</option>)}
        </Select>
      </Field>
      <Field label={t('palette.role')} error={errors.role}>
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">{t('palette.role_none')}</option>
          {ROLES.map((r) => <option key={r} value={r}>{t(`palette.roles.${r}`)}</option>)}
        </Select>
      </Field>
      <Field label={t('palette.target_count')} error={errors.target_count}>
        <Input type="number" min={1} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
      </Field>
      <Field label={t('palette.notes')}>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="text-clay-500" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />{t('palette.remove')}
        </Button>
        <Button size="sm" onClick={save}>{t('common.save')}</Button>
      </div>
    </div>
  )
}

/** Planned plants per strata: a quick read of the forest garden's layers. */
export function StrataBalance({ totals }: { totals: Record<Strata, number> }) {
  const max = Math.max(1, ...Object.values(totals))
  const any = Object.values(totals).some((v) => v > 0)
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('palette.balance')}</h3>
      <p className="mb-2 text-xs text-loam-400">{t('palette.balance_hint')}</p>
      {!any ? (
        <p className="text-xs text-loam-400">{t('palette.balance_empty')}</p>
      ) : (
        <ul className="space-y-1">
          {STRATA.filter((s) => s !== 'aquatic' || totals[s] > 0).map((s) => (
            <li key={s} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="truncate text-loam-600">{strataLabel(s)}</span>
              <span className="h-2 rounded-full bg-loam-100">
                <span className="block h-2 rounded-full" style={{ width: `${(totals[s] / max) * 100}%`, background: STRATA_COLORS[s] }} />
              </span>
              <span className="text-right tabular-nums text-loam-700">{totals[s]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
