import { Head } from '@inertiajs/react'
import clsx from 'clsx'
import { Compass, Copy, Eye, MoreHorizontal, Pencil, RotateCcw, Save, Sprout, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { formatDecimal } from '@/components/plants/format'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { columnLabel, displayValue, formatEuro } from '@/palette/format'
import { PaletteTable } from '@/palette/PaletteTable'
import { PlantSheet } from '@/palette/PlantSheet'
import { SuggestionsSheet } from '@/palette/Suggestions'
import {
  cellValue, crownArea, GROWTH_YEARS, normalizeSettings, sameSettings, scopeOf, toCsv, UNTAGGED, viewGroups,
  type PaletteRow, type ViewSettings,
} from '@/palette/table'
import { Popover, Toolbar } from '@/palette/Toolbar'

type SavedView = { id: number; name: string; settings: ViewSettings; position: number }
type Preset = { key: string; name: string; settings: ViewSettings }
type Current = { kind: 'preset'; key: string } | { kind: 'view'; id: number }

type Props = {
  map: { id: number; name: string; role: string; teamId?: number | null; offerBuilder?: boolean; country?: string | null; areaM2?: number | null }
  rows: PaletteRow[]
  tags: string[]
  views: SavedView[]
  presets: Preset[]
  schema: { columns: string[]; groups: string[] }
  canEdit: boolean
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
export default function PlantPalettePage({ map, rows: initialRows, tags: initialTags, views: initialViews, presets, schema, canEdit }: Props) {
  const [rows, setRows] = useState(initialRows)
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

  const inPalette = useMemo(() => new Set(rows.filter((r) => r.inPalette && r.varietyId == null && r.speciesId != null).map((r) => r.speciesId!)), [rows])
  const closeSuggestions = useCallback(() => setSuggesting(false), [])
  const suggestionAdded = useCallback(async (name: string) => {
    const res = await api<{ rows: PaletteRow[]; tags: string[] }>(`/maps/${map.id}/palette.json`)
    setRows(res.rows)
    setTags(res.tags)
    setStatus(t('plant_palette.suggestions.added', { name }))
  }, [map.id])

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

      {rows.length === 0 ? (
        <EmptyState
          title={t('plant_palette.empty.title')}
          action={<ButtonLink href={`/maps/${map.id}?panel=palette`} variant="secondary"><Sprout className="h-4 w-4" />{t('plant_palette.empty.action')}</ButtonLink>}
        >
          {t('plant_palette.empty.text')}
        </EmptyState>
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
              onSort={(key) => setSettings((s) => ({ ...s, sort: { key, dir: s.sort.key === key && s.sort.dir === 'asc' ? 'desc' : 'asc' } }))}
            />
          )}
        </>
      )}

      {suggesting && <SuggestionsSheet mapId={map.id} canEdit={canEdit} inPalette={inPalette} onAdded={suggestionAdded} onClose={closeSuggestions} />}
      {open && <PlantSheet mapId={map.id} row={rows.find((r) => r.key === open.key) ?? open} country={map.country} onClose={() => setOpen(null)} />}
    </>
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
  const budget = rows.reduce((s, r) => s + (r.unitPrice == null ? 0 : r.unitPrice * r.planned), 0)
  const stages = GROWTH_YEARS.map((years) => ({ years, area: crownArea(rows, years) }))
  const largest = Math.max(1, ...stages.map((s) => s.area))
  const showGrowth = areaM2 != null && areaM2 > 0 && largest > 1
  const facts = [
    t('plant_palette.summary.species', { count: species }),
    t('plant_palette.summary.planned', { count: planned }),
    t('plant_palette.summary.planted', { count: planted }),
    existing > 0 ? t('plant_palette.summary.existing', { count: existing }) : null,
    budget > 0 ? t('plant_palette.summary.budget', { amount: formatEuro(budget) }) : null,
  ].filter(Boolean)

  return (
    <>
      <p className="text-sm text-loam-700">{facts.join(' · ')}</p>
      {showGrowth && (
        <figure
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:ml-auto print:hidden"
          title={`${t('plant_palette.growth.caption')}. ${t('plant_palette.growth.hint')}`}
        >
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
        </figure>
      )}
    </>
  )
}

const slug = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
