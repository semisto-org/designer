import { Head } from '@inertiajs/react'
import clsx from 'clsx'
import { Compass, Copy, Eye, MoreHorizontal, Pencil, RotateCcw, Save, Sprout, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { formatDecimal } from '@/components/plants/format'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { BatchBar, BatchToast, type BatchChange } from '@/palette/BatchBar'
import { columnLabel, displayValue, formatEuro } from '@/palette/format'
import { PaletteTable, selectable } from '@/palette/PaletteTable'
import { PlantSheet } from '@/palette/PlantSheet'
import type { PlantLine } from '@/palette/plants'
import { PlantsTable } from '@/palette/PlantsTable'
import { SuggestionsSheet } from '@/palette/Suggestions'
import {
  cellValue, crownArea, GROWTH_YEARS, normalizeSettings, sameSettings, scopeOf, toCsv, toPlant, UNTAGGED, viewGroups,
  type PaletteRow, type ViewSettings,
} from '@/palette/table'
import { Popover, Toolbar } from '@/palette/Toolbar'

type SavedView = { id: number; name: string; settings: ViewSettings; position: number }
type Preset = { key: string; name: string; settings: ViewSettings }
type Current = { kind: 'preset'; key: string } | { kind: 'view'; id: number }

type Props = {
  map: { id: number; name: string; role: string; teamId?: number | null; offerBuilder?: boolean; country?: string | null; areaM2?: number | null }
  rows: PaletteRow[]
  plants: PlantLine[]
  tags: string[]
  views: SavedView[]
  presets: Preset[]
  schema: { columns: string[]; groups: string[] }
  canEdit: boolean
}

type Mode = 'species' | 'plants'
type Palette = { rows: PaletteRow[]; plants: PlantLine[]; tags: string[] }
type BatchResult = Palette & { changed: { species: number; plants: number }; undo: unknown }
type Done = { message: string; undo: unknown | null }
const modeKey = (mapId: number) => `palette-mode-${mapId}`
const readMode = (mapId: number): Mode => {
  if (new URLSearchParams(window.location.search).has('plants')) return 'plants'
  try { return window.localStorage.getItem(modeKey(mapId)) === 'plants' ? 'plants' : 'species' } catch { return 'species' }
}

const storageKey = (mapId: number) => `palette-view-${mapId}`
const readStored = (mapId: number): Current | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(mapId))
    return raw ? (JSON.parse(raw) as Current) : null
  } catch { return null }
}
const store = (mapId: number, current: Current) => {
  try { window.localStorage.setItem(storageKey(mapId), JSON.stringify(current)) } catch { /* private window */ }
}

/** Saved settings never carry the NUL of UNTAGGED: jsonb refuses it. */
const forServer = (s: ViewSettings): ViewSettings => ({ ...s, filters: { ...s.filters, tag: s.filters.tag === UNTAGGED ? null : s.filters.tag } })

/**
 * « Palette végétale »: every plant of the project in one table, the way
 * designers keep it in a spreadsheet, seen through views (built-in ones,
 * and the ones editors save for the map, Notion-like): budget, shopping list
 * for a planting day, follow-up… A plant's name opens its sheet.
 */
export default function PlantPalettePage({ map, rows: initialRows, plants: initialPlants, tags: initialTags, views: initialViews, presets, schema, canEdit }: Props) {
  const [rows, setRows] = useState(initialRows)
  const [plants, setPlants] = useState(initialPlants)
  const [mode, setMode] = useState<Mode>(() => (typeof window === 'undefined' ? 'species' : readMode(map.id)))
  const [tags, setTags] = useState(initialTags)
  const [views, setViews] = useState(initialViews)
  const [current, setCurrent] = useState<Current>(() => {
    const stored = typeof window === 'undefined' ? null : readStored(map.id)
    if (stored?.kind === 'view' && initialViews.some((v) => v.id === stored.id)) return stored
    if (stored?.kind === 'preset' && presets.some((p) => p.key === stored.key)) return stored
    return { kind: 'preset', key: presets[0].key }
  })
  const baseline = useMemo(() => {
    const raw = current.kind === 'preset' ? presets.find((p) => p.key === current.key)?.settings : views.find((v) => v.id === current.id)?.settings
    return normalizeSettings(raw ?? presets[0].settings)
  }, [current, presets, views])
  const [settings, setSettings] = useState<ViewSettings>(baseline)
  const [open, setOpen] = useState<PaletteRow | null>(null)
  const [suggesting, setSuggesting] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('suggestions'))
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [selectedPlants, setSelectedPlants] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done | null>(null)

  const currentView = current.kind === 'view' ? views.find((v) => v.id === current.id) ?? null : null
  const editableView = canEdit && currentView != null
  const modified = !sameSettings(settings, baseline)

  function choose(next: Current) {
    setCurrent(next)
    store(map.id, next)
    const raw = next.kind === 'preset' ? presets.find((p) => p.key === next.key)?.settings : views.find((v) => v.id === next.id)?.settings
    setSettings(normalizeSettings(raw ?? presets[0].settings))
  }

  // A saved view follows its editor's changes, like a Notion view.
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (!editableView || !modified || !currentView) return
    if (timer.current) window.clearTimeout(timer.current)
    const id = currentView.id
    timer.current = window.setTimeout(() => {
      setStatus(t('plant_palette.views.saving'))
      api<{ views: SavedView[] }>(`/maps/${map.id}/palette/views/${id}`, { method: 'PATCH', body: { view: { settings: forServer(settings) } } })
        .then((res) => { setViews(res.views); setStatus(t('plant_palette.views.saved_now')); setError(null) })
        .catch((e) => { setStatus(null); setError(e instanceof ApiError ? e.message : t('plant_palette.errors.generic')) })
    }, 700)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [settings, editableView, modified, currentView, map.id])

  async function createView(name: string, from: ViewSettings) {
    try {
      const res = await api<{ view: SavedView; views: SavedView[] }>(`/maps/${map.id}/palette/views`, { method: 'POST', body: { view: { name, settings: forServer(from) } } })
      setViews(res.views)
      const next: Current = { kind: 'view', id: res.view.id }
      setCurrent(next)
      store(map.id, next)
      setSettings(normalizeSettings(res.view.settings))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('plant_palette.errors.generic'))
    }
  }

  function duplicate() {
    const source = currentView?.name ?? presets.find((p) => current.kind === 'preset' && p.key === current.key)?.name ?? ''
    const name = window.prompt(t('plant_palette.views.name_prompt'), t('plant_palette.views.copy_name', { name: source }))
    if (name?.trim()) void createView(name.trim(), settings)
  }

  async function rename(view: SavedView) {
    const name = window.prompt(t('plant_palette.views.name_prompt'), view.name)
    if (!name?.trim() || name.trim() === view.name) return
    try {
      const res = await api<{ views: SavedView[] }>(`/maps/${map.id}/palette/views/${view.id}`, { method: 'PATCH', body: { view: { name: name.trim() } } })
      setViews(res.views)
    } catch (e) { setError(e instanceof ApiError ? e.message : t('plant_palette.errors.generic')) }
  }

  async function remove(view: SavedView) {
    if (!window.confirm(t('plant_palette.views.delete_confirm', { name: view.name }))) return
    try {
      const res = await api<{ views: SavedView[] }>(`/maps/${map.id}/palette/views/${view.id}`, { method: 'DELETE' })
      setViews(res.views)
      choose({ kind: 'preset', key: presets[0].key })
    } catch (e) { setError(e instanceof ApiError ? e.message : t('plant_palette.errors.generic')) }
  }

  const editPlant = useCallback(async (row: PaletteRow, field: string, value: string | null) => {
    const attr = field === 'target' ? 'target_count' : field
    try {
      const res = await api<{ rows: PaletteRow[]; tags: string[] }>(`/maps/${map.id}/palette/plants/${encodeURIComponent(row.key)}`, { method: 'PATCH', body: { plant: { [attr]: value } } })
      setRows(res.rows)
      setTags(res.tags)
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('plant_palette.sheet.save_error'))
      return false
    }
  }, [map.id])

  function chooseMode(next: Mode) {
    setMode(next)
    setStatus(null)
    setError(null)
    setSelectedKeys(new Set())
    setSelectedPlants(new Set())
    try { window.localStorage.setItem(modeKey(map.id), next) } catch { /* private window */ }
  }

  const plantSaved = useCallback((lines: Partial<PlantLine>[]) => {
    setPlants((list) => list.map((plant) => {
      const line = lines.find((l) => l.id === plant.id)
      return line ? { ...plant, ...line } : plant
    }))
  }, [])

  const refresh = useCallback((res: Palette) => {
    setRows(res.rows)
    setTags(res.tags)
    // Keep the table's order while someone renumbers: only the values move.
    setPlants((list) => {
      const fresh = new Map(res.plants.map((p) => [p.id, p]))
      const kept = list.filter((p) => fresh.has(p.id)).map((p) => fresh.get(p.id)!)
      return [...kept, ...res.plants.filter((p) => !list.some((old) => old.id === p.id))]
    })
  }, [])

  const reload = useCallback(async () => {
    refresh(await api<Palette>(`/maps/${map.id}/palette.json`))
  }, [map.id, refresh])

  // The selection keeps only what is still on the page (a plant deleted
  // on the map, a species that left the palette).
  useEffect(() => {
    const keys = new Set(rows.filter(selectable).map((r) => r.key))
    setSelectedKeys((s) => ([...s].every((k) => keys.has(k)) ? s : new Set([...s].filter((k) => keys.has(k)))))
    const ids = new Set(plants.map((p) => p.id))
    setSelectedPlants((s) => ([...s].every((id) => ids.has(id)) ? s : new Set([...s].filter((id) => ids.has(id)))))
  }, [rows, plants])

  // A new selection takes the place of the last action's message.
  const selecting = selectedKeys.size + selectedPlants.size > 0
  useEffect(() => { if (selecting) setDone(null) }, [selecting])

  /** An action on the selection of the current table, confirmed first when it deletes. */
  async function applyBatch(change: BatchChange, value: string | null) {
    const species = mode === 'species'
    const keys = species ? [...selectedKeys] : []
    const plantIds = species ? [] : [...selectedPlants]
    if (change === 'delete' && !window.confirm(deleteQuestion(keys, plantIds))) return
    setBusy(true)
    try {
      const res = await api<BatchResult>(`/maps/${map.id}/palette/batch`, {
        method: 'POST', body: { batch: { keys, plant_ids: plantIds, change, value: value ?? '' } },
      })
      refresh(res)
      setSelectedKeys(new Set())
      setSelectedPlants(new Set())
      setError(null)
      setDone({ message: batchMessage(change, res.changed, keys, res.rows), undo: res.changed.species + res.changed.plants > 0 ? res.undo : null })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('plant_palette.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const undoBatch = useCallback(async (undo: unknown) => {
    setBusy(true)
    try {
      refresh(await api<Palette>(`/maps/${map.id}/palette/batch/undo`, { method: 'POST', body: { undo } }))
      setDone({ message: t('plant_palette.batch.undone'), undo: null })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('plant_palette.errors.generic'))
    } finally {
      setBusy(false)
    }
  }, [map.id, refresh])

  function deleteQuestion(keys: string[], plantIds: number[]) {
    if (keys.length === 0) return `${t('plant_palette.batch.delete_plants_confirm', { count: plantIds.length })} ${t('plant_palette.batch.delete_undo_hint')}`
    const names = keys.map((key) => rows.find((r) => r.key === key)?.name).filter((n): n is string => !!n)
    const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} ${t('plant_palette.batch.and_more', { count: names.length - 3 })}` : names.join(', ')
    const drawn = plants.filter((p) => p.key != null && keys.includes(p.key)).length
    return [
      t('plant_palette.batch.delete_species_confirm', { names: listed }),
      drawn > 0 ? t('plant_palette.batch.delete_species_plants', { count: drawn }) : null,
      t('plant_palette.batch.delete_undo_hint'),
    ].filter(Boolean).join(' ')
  }

  const plantStatus = useCallback((message: string | null, failed = false) => {
    if (failed) { setError(message); setStatus(null) } else { setStatus(message); setError(null) }
  }, [])

  const inPalette = useMemo(() => new Set(rows.filter((r) => r.inPalette && r.varietyId == null && r.speciesId != null).map((r) => r.speciesId!)), [rows])
  const closeSuggestions = useCallback(() => setSuggesting(false), [])
  const suggestionAdded = useCallback(async (name: string) => {
    await reload()
    setStatus(t('plant_palette.suggestions.added', { name }))
  }, [reload])

  const groups = useMemo(() => viewGroups(rows, settings, tags), [rows, settings, tags])
  const shown = groups.flatMap((g) => g.rows)
  const suppliers = useMemo(() => [...new Set(rows.map((r) => r.supplier).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'fr')), [rows])
  const scope = scopeOf(settings.filters)

  function exportCsv() {
    const csv = toCsv(groups, settings.columns, columnLabel, (row, column) => {
      const value = cellValue(row, column)
      return typeof value === 'number' ? String(value).replace('.', ',') : displayValue(row, column)
    })
    const view = currentView?.name ?? presets.find((p) => current.kind === 'preset' && p.key === current.key)?.name ?? ''
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `${t('plant_palette.csv_filename')}-${slug(map.name)}-${slug(view)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const presetIntro = current.kind === 'preset' ? t(`plant_palette.preset_intros.${current.key}`) : null

  return (
    <>
      <Head title={t('plant_palette.page_title', { map: map.name })} />
      <div className="print:hidden"><MapViewHeader map={map} current="palette" /></div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl">{t('plant_palette.title')}</h1>
          <span className="print:hidden"><HelpButton slug="la-palette-vegetale-en-tableau" /></span>
          <button
            type="button" onClick={() => setSuggesting(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-leaf-800 ring-1 ring-inset ring-leaf-200 hover:bg-leaf-50 print:hidden"
          >
            <Compass className="h-4 w-4" aria-hidden />{t('plant_palette.suggestions.open')}
          </button>
          {!canEdit && (
            <span title={t('plant_palette.read_only')} className="inline-flex items-center gap-1 rounded-full bg-loam-100 px-2.5 py-0.5 text-sm text-loam-600 print:hidden">
              <Eye className="h-3.5 w-3.5" aria-hidden />{t('plant_palette.read_only_badge')}
            </span>
          )}
        </div>
        {rows.length > 0 && <Summary rows={rows} areaM2={map.areaM2 ?? null} />}
      </div>

      {rows.length === 0 && plants.length === 0 ? (
        <EmptyState
          title={t('plant_palette.empty.title')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => setSuggesting(true)}><Compass className="h-4 w-4" />{t('plant_palette.empty.suggestions')}</Button>
              <ButtonLink href={`/maps/${map.id}?panel=palette`} variant="secondary"><Sprout className="h-4 w-4" />{t('plant_palette.empty.action')}</ButtonLink>
            </div>
          }
        >
          {t('plant_palette.empty.text')}
        </EmptyState>
      ) : (
        <>
          <ModeSwitch mode={mode} onChange={chooseMode} />
          {mode === 'plants' ? (
            <>
              {status && <p className="mb-3 text-sm text-leaf-800 print:hidden" role="status">{status}</p>}
              {error && <p className="mb-3 rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700 print:hidden" role="alert">{error}</p>}
              <PlantsTable
                mapId={map.id} plants={plants} tags={tags} canEdit={canEdit} onSaved={plantSaved} onPlantedChanged={() => void reload()} onStatus={plantStatus}
                selected={canEdit ? selectedPlants : undefined} onSelect={canEdit ? setSelectedPlants : undefined}
              />
            </>
          ) : (
            <>
              <nav aria-label={t('plant_palette.views.label')} className="-mx-4 mb-3 overflow-x-auto px-4 print:hidden">
                <ul className="flex items-center gap-1.5">
                  {presets.map((preset) => (
                    <ViewTab key={preset.key} active={current.kind === 'preset' && current.key === preset.key} onClick={() => choose({ kind: 'preset', key: preset.key })}>
                      {preset.name}
                    </ViewTab>
                  ))}
                  {views.length > 0 && <li aria-hidden className="mx-1 h-5 w-px shrink-0 bg-loam-300" />}
                  {views.map((view) => (
                    <ViewTab key={view.id} active={current.kind === 'view' && current.id === view.id} onClick={() => choose({ kind: 'view', id: view.id })}>
                      {view.name}
                    </ViewTab>
                  ))}
                  {canEdit && (
                    <li className="shrink-0">
                      <button type="button" onClick={duplicate} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-prune-700 hover:bg-prune-50">
                        <Copy className="h-4 w-4" aria-hidden />{t('plant_palette.views.duplicate')}
                      </button>
                    </li>
                  )}
                  {editableView && currentView && (
                    <li className="shrink-0">
                      <Popover label={<MoreHorizontal className="h-4 w-4" aria-label={currentView.name} />} align="right">
                        <div className="w-52 text-sm">
                          <button type="button" onClick={() => void rename(currentView)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-loam-700 hover:bg-loam-50">
                            <Pencil className="h-4 w-4" />{t('plant_palette.views.rename')}
                          </button>
                          <button type="button" onClick={() => void remove(currentView)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-clay-700 hover:bg-clay-50">
                            <Trash2 className="h-4 w-4" />{t('plant_palette.views.delete')}
                          </button>
                        </div>
                      </Popover>
                    </li>
                  )}
                </ul>
              </nav>

              {(presetIntro || status) && (
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm print:hidden">
                  {presetIntro && <p className="text-loam-600">{presetIntro}</p>}
                  {status && <p className="text-loam-500">{status}</p>}
                </div>
              )}

              {/* No backdrop blur here: it would pin the filters' phone sheet to this bar instead of the screen. */}
              <div className="sticky top-0 z-20 -mx-4 mb-3 bg-loam-50 px-4 py-2 print:static">
                <Toolbar settings={settings} schema={schema} tags={tags} suppliers={suppliers} onChange={setSettings} onExport={exportCsv} />
              </div>

              {modified && !editableView && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-humus-50 px-4 py-2.5 text-sm text-humus-900 ring-1 ring-humus-200 print:hidden">
                  <span className="mr-auto">{t('plant_palette.views.unsaved')}</span>
                  <button type="button" onClick={() => setSettings(baseline)} className="inline-flex items-center gap-1 rounded-full px-3 py-1 hover:bg-humus-100">
                    <RotateCcw className="h-4 w-4" aria-hidden />{t('plant_palette.views.reset')}
                  </button>
                  {canEdit && (
                    <button type="button" onClick={duplicate} className="inline-flex items-center gap-1 rounded-full bg-prune-600 px-3 py-1 font-semibold text-white hover:bg-prune-800">
                      <Save className="h-4 w-4" aria-hidden />{t('plant_palette.views.save_as')}
                    </button>
                  )}
                </div>
              )}

              {error && <p className="mb-3 rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700 print:hidden">{error}</p>}

              {scope && (
                <p className="mb-2 text-sm font-medium text-leaf-800">
                  {scope === UNTAGGED ? t('plant_palette.tag_scope_untagged') : t('plant_palette.tag_scope', { tag: scope })}
                </p>
              )}

              {shown.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-loam-300 bg-white/60 px-6 py-10 text-center text-sm text-loam-500">{t('plant_palette.empty.filtered')}</p>
              ) : (
                <PaletteTable
                  groups={groups} settings={settings} canEdit={canEdit} suppliers={suppliers}
                  onOpen={setOpen} onEdit={editPlant}
                  selected={canEdit ? selectedKeys : undefined} onSelect={canEdit ? setSelectedKeys : undefined}
                  onSort={(key) => setSettings((s) => ({ ...s, sort: { key, dir: s.sort.key === key && s.sort.dir === 'asc' ? 'desc' : 'asc' } }))}
                />
              )}
            </>
          )}
        </>
      )}

      {canEdit && (mode === 'species' ? selectedKeys.size : selectedPlants.size) > 0 ? (
        <BatchBar
          kind={mode} count={mode === 'species' ? selectedKeys.size : selectedPlants.size} busy={busy} onApply={(change, value) => void applyBatch(change, value)}
          onClear={() => { setSelectedKeys(new Set()); setSelectedPlants(new Set()) }}
        />
      ) : done && (
        <BatchToast
          message={done.message} busy={busy} onClose={() => setDone(null)}
          onUndo={done.undo ? () => void undoBatch(done.undo) : null}
        />
      )}
      {/* Room under the table, so the bar never hides its last rows. */}
      {canEdit && <div aria-hidden className="h-20 print:hidden" />}

      {suggesting && <SuggestionsSheet mapId={map.id} canEdit={canEdit} inPalette={inPalette} onAdded={suggestionAdded} onClose={closeSuggestions} />}
      {open && <PlantSheet mapId={map.id} row={rows.find((r) => r.key === open.key) ?? open} country={map.country} onClose={() => setOpen(null)} />}
    </>
  )
}

/** « Par espèce » (the palette, one row per species) or « Plant par plant » (each plant point with its number). */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div role="group" aria-label={t('plant_palette.modes.label')} className="mb-3 inline-flex rounded-full bg-white p-1 ring-1 ring-inset ring-loam-200 print:hidden">
      {(['species', 'plants'] as const).map((value) => (
        <button
          key={value} type="button" onClick={() => onChange(value)} aria-pressed={mode === value}
          className={clsx('rounded-full px-3.5 py-1 text-sm font-medium transition-colors', mode === value ? 'bg-leaf-700 text-white' : 'text-loam-700 hover:bg-loam-50')}
        >
          {t(`plant_palette.modes.${value}`)}
        </button>
      ))}
    </div>
  )
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <li className="shrink-0">
      <button
        type="button" onClick={onClick} aria-current={active ? 'true' : undefined}
        className={clsx('rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors', active ? 'bg-prune-600 text-white' : 'text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-white')}
      >
        {children}
      </button>
    </li>
  )
}

/**
 * The palette at a glance in one line, then the garden in time: how much of
 * the land the crowns of its trees and shrubs will cover after 1, 5, 15 and
 * 30 years.
 */
function Summary({ rows, areaM2 }: { rows: PaletteRow[]; areaM2: number | null }) {
  const species = rows.length
  const planned = rows.reduce((s, r) => s + r.planned, 0)
  const planted = rows.reduce((s, r) => s + r.planted, 0)
  const existing = rows.reduce((s, r) => s + r.existing, 0)
  // What is left to buy leads, as in the Budget view; the full cost, plants in the ground included, follows.
  const budget = rows.reduce((s, r) => s + (r.unitPrice == null ? 0 : r.unitPrice * r.planned), 0)
  const toBuy = rows.reduce((s, r) => s + (r.unitPrice == null ? 0 : r.unitPrice * toPlant(r)), 0)
  const stages = GROWTH_YEARS.map((years) => ({ years, area: crownArea(rows, years) }))
  const largest = Math.max(1, ...stages.map((s) => s.area))
  const showGrowth = areaM2 != null && areaM2 > 0 && largest > 1
  const facts = [
    t('plant_palette.summary.species', { count: species }),
    t('plant_palette.summary.planned', { count: planned }),
    t('plant_palette.summary.planted', { count: planted }),
    existing > 0 ? t('plant_palette.summary.existing', { count: existing }) : null,
    budget > 0 ? t(toBuy === budget ? 'plant_palette.summary.to_buy' : 'plant_palette.summary.to_buy_of', { amount: formatEuro(toBuy), total: formatEuro(budget) }) : null,
  ].filter(Boolean)

  return (
    <>
      <p className="text-sm text-loam-700">{facts.join(' · ')}</p>
      {showGrowth && (
        <figure className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:ml-auto print:hidden" title={t('plant_palette.growth.hint')}>
          <figcaption className="font-medium text-leaf-800">{t('plant_palette.growth.short')}</figcaption>
          <ol className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {stages.map(({ years, area }) => {
              const size = 6 + 14 * Math.sqrt(area / largest)
              return (
                <li key={years} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
                    <span className="block rounded-full bg-leaf-500/70 ring-1 ring-leaf-600/30" style={{ width: size, height: size }} />
                  </span>
                  <span className="tabular-nums text-loam-800">{formatDecimal(Math.round((area * 100) / areaM2!))} %</span>
                  <span className="text-loam-500">{t('plant_palette.growth.years', { years })}</span>
                </li>
              )
            })}
          </ol>
          {/* No hover on a phone: the explanation is written out there. */}
          <p className="basis-full text-sm text-loam-500 sm:hidden">{t('plant_palette.growth.hint')}</p>
        </figure>
      )}
    </>
  )
}

/** What an action on the selection did, in one sentence or two. */
function batchMessage(change: BatchChange, changed: { species: number; plants: number }, keys: string[], rows: PaletteRow[]): string {
  if (changed.species + changed.plants === 0) return t('plant_palette.batch.done.nothing')
  if (change === 'role' || change === 'strata') return t(`plant_palette.batch.done.${change}`, { count: changed.species })
  if (change === 'planted') return t('plant_palette.batch.done.planted', { count: changed.plants })
  const parts = [
    changed.species > 0 ? t('plant_palette.batch.done.deleted_species', { count: changed.species }) : null,
    changed.plants > 0 ? t('plant_palette.batch.done.deleted_plants', { count: changed.plants }) : null,
    // A species still composed in a patch keeps its row.
    keys.some((key) => rows.some((r) => r.key === key && r.composed > 0)) ? t('plant_palette.batch.done.still_in_patches') : null,
  ]
  return parts.filter(Boolean).join(' ')
}

const slug = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
