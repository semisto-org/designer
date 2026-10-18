import { Check, Compass, ExternalLink, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { strataLabel } from '@/components/plants/format'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { PaletteDrafts } from '@/map/plants/PaletteDrafts'
import { byHardiness, hardinessHere, matchesPalette, type Hardiness } from '@/map/plants/paletteSearch'
import { ProposeSpecies } from '@/map/plants/ProposeSpecies'
import { setPlacing, setPlanting, usePlanting } from '@/map/plants/store'
import { STRATA_COLORS, StrataDot } from '@/map/plants/strata'
import {
  STRATA, type PaletteItem, type PaletteRole, type PlantSearchResult, type PlantingState,
  type SpeciesSheet, type SpeciesSummary, type Strata, type VarietySummary,
} from '@/types/plants'

const ROLES: PaletteRole[] = ['food', 'support', 'pioneer', 'hedge', 'ornamental']

/**
 * « Palette » panel: the species chosen for this terrain. Search the
 * palette, and the catalogue when the plant isn't in it yet (hardy species
 * first), start from suggestions, place plants on the map, draw a patch,
 * and watch the strata balance.
 */
export default function PalettePanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data, error, placing } = usePlanting(mapId)
  const [query, setQuery] = useState('')
  const [catalogueAsked, setCatalogueAsked] = useState(false)
  const [results, setResults] = useState<SpeciesSummary[] | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const zone = data?.zone ?? null
  const q = query.trim()

  const paletteSpecies = useMemo(() => new Set(data?.palette.filter((i) => !i.varietyId).map((i) => i.speciesId)), [data])
  const paletteVarieties = useMemo(() => new Set(data?.palette.flatMap((i) => (i.varietyId ? [i.varietyId] : []))), [data])
  const matches = useMemo(() => (data?.palette ?? []).filter((i) => matchesPalette(i, q)), [data, q])
  // The catalogue opens by itself when the palette has nothing by that name;
  // otherwise on demand (another variety of an apple already in the palette).
  const showCatalogue = editor.canEdit && q.length >= 2 && (matches.length === 0 || catalogueAsked)

  // Catalogue search, debounced. Every species comes back, hardy here or not:
  // a filter would hide the ones whose hardiness the catalogue doesn't know
  // yet, and offer to add again a plant that is already there.
  useEffect(() => {
    if (!showCatalogue) { setResults(null); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q })
      if (data?.country) params.set('country', data.country)
      api<PlantSearchResult>(`/plants?${params}`, { signal: controller.signal })
        .then((r) => setResults(byHardiness(r.results.slice(0, 12), zone)))
        .catch(() => undefined)
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [showCatalogue, q, zone, data?.country])

  function search(value: string) {
    setQuery(value)
    setCatalogueAsked(false)
  }

  // A species, or one of its cultivars by name: the catalogue's, or a new one
  // the server adds to it (a cultivar seen in the orchard, missing so far).
  async function add(species: SpeciesSummary, varietyName?: string) {
    try {
      const r = await api<{ item: PaletteItem; planting: PlantingState }>(`/maps/${mapId}/palette_items`, {
        method: 'POST', body: { palette_item: { species_id: species.id, ...(varietyName ? { variety_name: varietyName } : {}) } },
      })
      setPlanting(mapId, r.planting)
      setCatalogueAsked(true)
      editor.notify(t('palette.added', { name: r.item.name }))
      return true
    } catch (e) {
      editor.notify(e instanceof ApiError ? e.message : t('palette.load_error'), 'error')
      return false
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

  const groups = STRATA.map((strata) => ({ strata, items: matches.filter((i) => i.effectiveStrata === strata) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="space-y-5 text-sm">
      <p className="text-sm text-loam-500">{t('palette.intro')}</p>
      {!editor.canEdit && <p className="rounded-lg bg-loam-50 p-2 text-sm text-loam-600">{t('palette.read_only')}</p>}
      {data.paletteDrafts && data.paletteDrafts.length > 0 && <PaletteDrafts drafts={data.paletteDrafts} />}

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={t('palette.search_placeholder')}
            aria-label={t('palette.search_label')}
            className="pl-9"
          />
        </div>
        {!q && editor.canEdit && (
          <a href={`/maps/${mapId}/palette?suggestions=1`} className="inline-flex items-center gap-1.5 text-sm font-medium text-leaf-800 hover:underline">
            <Compass className="h-4 w-4" aria-hidden />{t('palette.suggestions_link')}
          </a>
        )}
      </div>

      <section>
        {groups.length === 0 ? (
          q
            ? <p className="text-sm text-loam-600">{t('palette.not_in_palette', { query: q })}</p>
            : <p className="rounded-lg border border-dashed border-loam-300 p-3 text-sm text-loam-500">{t('palette.empty')}</p>
        ) : (
          <div className="space-y-3">
            {groups.map(({ strata, items }) => (
              <div key={strata}>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-loam-500">
                  <StrataDot strata={strata} />{strataLabel(strata)}
                </h3>
                <ul className="divide-y divide-loam-100">
                  {items.map((item) => (
                    <li key={item.id} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-loam-800">{item.name}</p>
                          <p className="truncate text-sm text-loam-500">
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
                              className={'inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm ' + (placing?.id === item.id ? 'bg-leaf-600 text-white' : 'bg-leaf-50 text-leaf-700 hover:bg-leaf-100')}
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

      {editor.canEdit && q.length >= 2 && !showCatalogue && (
        <button type="button" onClick={() => setCatalogueAsked(true)} className="inline-flex items-start gap-1.5 text-left text-sm font-medium text-prune-700 underline-offset-2 hover:underline">
          <Plus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('palette.search_catalogue', { query: q })}
        </button>
      )}

      {showCatalogue && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-loam-700">{t('palette.catalogue_title')}</h3>
          {zone && <p className="text-sm text-loam-500">{t('palette.hardiness_hint', { zone })}</p>}
          {results && (
            results.length === 0
              ? <p className="text-sm text-loam-500">{t('palette.results_empty')} {t('palette.variety_hint')}</p>
              : <SpeciesList items={results} zone={zone} inPalette={paletteSpecies} varietiesInPalette={paletteVarieties} onAdd={add} />
          )}
          {results && <ProposeSpecies key={q} query={query} inPalette={paletteSpecies} onAdd={add} onDone={() => search('')} />}
        </section>
      )}

      {!q && <StrataBalance totals={data.strata} />}

      {editor.canEdit && !q && (
        <Button variant="secondary" size="sm" className="w-full" onClick={drawPatch} disabled={editor.drawing}>
          <Plus className="h-4 w-4" />{t('palette.draw_patch')}
        </Button>
      )}
    </div>
  )
}

type AddToPalette = (species: SpeciesSummary, varietyName?: string) => Promise<boolean>

function SpeciesList({ items, zone, inPalette, varietiesInPalette, onAdd }: {
  items: SpeciesSummary[]; zone: number | null; inPalette: Set<number>; varietiesInPalette: Set<number>; onAdd: AddToPalette
}) {
  const [varietyOf, setVarietyOf] = useState<number | null>(null)
  return (
    <ul className="max-h-96 divide-y divide-loam-100 overflow-y-auto rounded-lg ring-1 ring-loam-200">
      {items.map((s) => (
        <li key={s.id} className="px-2 py-1.5">
          <div className="flex items-center gap-2">
            <StrataDot strata={s.strata} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-loam-800">
                {s.commonName ?? s.latinName}
                {s.reviewStatus === 'proposed' && (
                  <span className="ml-1.5 rounded-full bg-humus-100 px-1.5 py-0.5 text-sm text-humus-800" title={t('plants.proposal.badge_title')}>
                    {t('plants.proposal.badge')}
                  </span>
                )}
              </p>
              <p className="truncate text-sm text-loam-500"><i>{s.latinName}</i></p>
              <HardinessNote species={s} zone={zone} />
            </div>
            <a href={`/plants/${s.slug}`} target="_blank" rel="noreferrer" className="rounded p-1 text-loam-400 hover:bg-loam-100" title={t('palette.open_sheet')} aria-label={t('palette.open_sheet')}>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {inPalette.has(s.id) ? (
              <span className="text-sm text-leaf-700">{t('palette.in_palette')}</span>
            ) : (
              <button type="button" onClick={() => void onAdd(s)} className="rounded-md bg-prune-50 p-1 text-prune-700 hover:bg-prune-100" title={t('palette.add')} aria-label={t('palette.add')}>
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* The cultivars the search named, each one click away. */}
          {s.namedVarieties && s.namedVarieties.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1.5 pl-4">
              {s.namedVarieties.map((v) => (
                <li key={v.id}>
                  {varietiesInPalette.has(v.id) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-leaf-50 px-2 py-0.5 text-sm text-leaf-800">
                      <Check className="h-3.5 w-3.5" aria-hidden />'{v.name}'
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onAdd(s, v.name)}
                      title={t('palette.variety.add_named', { name: `'${v.name}'` })}
                      className="inline-flex items-center gap-1 rounded-full bg-prune-50 px-2 py-0.5 text-sm text-prune-800 hover:bg-prune-100"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />'{v.name}'
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {varietyOf === s.id ? (
            <VarietyForm species={s} onAdd={onAdd} onDone={() => setVarietyOf(null)} />
          ) : (
            <button
              type="button"
              onClick={() => setVarietyOf(s.id)}
              title={t('palette.variety.open_title', { name: s.commonName ?? s.latinName })}
              className="mt-1 ml-4 inline-flex items-center gap-1 text-sm font-medium text-prune-700 underline-offset-2 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />{t('palette.variety.open')}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * A cultivar of a species for the palette: pick one the catalogue knows,
 * or write the name of the one growing in the orchard, which joins the
 * catalogue with empty values.
 */
function VarietyForm({ species, onAdd, onDone }: { species: SpeciesSummary; onAdd: AddToPalette; onDone: () => void }) {
  const [known, setKnown] = useState<VarietySummary[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const listId = `palette-varieties-${species.id}`
  const speciesName = species.commonName ?? species.latinName

  useEffect(() => {
    const controller = new AbortController()
    api<{ species: SpeciesSheet }>(`/plants/${species.slug}`, { signal: controller.signal })
      .then((r) => setKnown(r.species.varieties))
      .catch(() => setKnown([]))
    return () => controller.abort()
  }, [species.slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    const added = await onAdd(species, name.trim())
    setBusy(false)
    if (added) onDone()
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-1.5 rounded-lg bg-loam-50 p-2">
      <label htmlFor={`${listId}-input`} className="block text-sm font-medium text-loam-700">{t('palette.variety.label', { name: speciesName })}</label>
      <Input
        id={`${listId}-input`}
        list={listId}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('palette.variety.placeholder')}
        autoFocus
      />
      <datalist id={listId}>
        {known?.map((v) => <option key={v.id} value={v.name} />)}
      </datalist>
      {known && (
        <p className="text-sm text-loam-500">
          {known.length > 0 ? t('palette.variety.known', { count: known.length }) : t('palette.variety.none')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || busy}>{t('palette.variety.add')}</Button>
      </div>
    </form>
  )
}

const HARDINESS_COLORS: Record<Hardiness, string> = { fits: 'text-leaf-700', misfit: 'text-clay-600', unknown: 'text-loam-500' }

/** Whether the species survives this terrain's winter, said in words rather than a zone number alone. */
function HardinessNote({ species, zone }: { species: SpeciesSummary; zone: number | null }) {
  const hardiness = hardinessHere(species.hardinessZone, zone)
  const text = species.hardinessZone == null
    ? t('palette.hardiness.unknown')
    : zone == null
      ? t('plants.card.zone', { zone: species.hardinessZone })
      : t(`palette.hardiness.${hardiness}`, { zone: species.hardinessZone })
  return <p className={`truncate text-sm ${HARDINESS_COLORS[hardiness]}`}>{text}</p>
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
      <h3 className="text-sm font-semibold uppercase tracking-wide text-loam-500">{t('palette.balance')}</h3>
      <p className="mb-2 text-sm text-loam-400">{t('palette.balance_hint')}</p>
      {!any ? (
        <p className="text-sm text-loam-400">{t('palette.balance_empty')}</p>
      ) : (
        <ul className="space-y-1">
          {STRATA.filter((s) => s !== 'aquatic' || totals[s] > 0).map((s) => (
            <li key={s} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
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
