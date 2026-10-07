import clsx from 'clsx'
import { Loader2, MapPin, MapPinOff, Plus, Sprout, Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { visibleOffset } from '@/map/visiblePadding'
import { formatDate } from '@/map/soil/format'
import { photoUrl } from '@/map/photos/format'
import { photoActions } from '@/map/photos/store'
import { IndicatorChips, indicatorLabel } from '@/map/soil/IndicatorChips'
import PhotoObservation from '@/map/soil/PhotoObservation'
import { soilActions, useSoil, type ObservationDraft } from '@/map/soil/store'
import type { Abundance, BioObservation, CatalogPlant, PlantSuggestion, SoilIndicatorKey } from '@/types/soil_photos'

const ABUNDANCES: Abundance[] = ['rare', 'present', 'frequent', 'dominant']
const EMPTY_DRAFT: ObservationDraft = { speciesName: '', latinName: null, catalogKey: null, plantSpeciesId: null, abundance: 'present', notes: '' }

type Option =
  | { kind: 'catalog'; key: string; plant: CatalogPlant }
  | { kind: 'plant'; key: string; plant: PlantSuggestion }

/** Why the list says what it says: each claim with its figures and references. */
function Evidence({ plant }: { plant: CatalogPlant }) {
  const claims = plant.indicates.flatMap((key) => {
    const evidence = plant.evidence[key]
    return evidence ? [{ key, evidence }] : []
  })
  if (claims.length === 0) return null
  return (
    <details className="text-[11px] text-loam-500">
      <summary className="cursor-pointer">{t('soil.plants.evidence_title')}</summary>
      <ul className="mt-1 space-y-1">
        {claims.map(({ key, evidence }) => (
          <li key={key}>
            <span className="font-medium text-loam-700">{indicatorLabel(key)}</span>
            {evidence.status === 'to_verify' && <span> ({t('soil.plants.unverified_short')})</span>}
            {evidence.detail && <span>{'\u00a0: '}{evidence.detail}</span>}
            {evidence.sources.length > 0 && (
              <span>
                {' — '}
                {evidence.sources.map((source, i) => (
                  <span key={source.label}>
                    {i > 0 && ', '}
                    {source.url ? <a href={source.url} target="_blank" rel="noreferrer" title={source.title} className="hover:underline">{source.label}</a> : <span title={source.title}>{source.label}</span>}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Plants noted on the terrain and what they suggest about the soil. */
export default function PlantsTab() {
  const editor = useEditor()
  const state = useSoil()
  const { observations, summary, catalog, observationsLoaded } = state

  return (
    <div className="space-y-5">
      <p className="text-sm text-loam-600">{t('soil.plants.intro')}</p>

      {editor.canEdit ? <><PhotoObservation /><ObservationForm /></> : <p className="rounded-lg bg-loam-50 p-3 text-xs text-loam-500">{t('soil.plants.read_only')}</p>}

      <section className="space-y-2" aria-label={t('soil.plants.summary_title')}>
        <h3 className="text-sm font-semibold text-loam-800">{t('soil.plants.summary_title')}</h3>
        {summary.length === 0 ? (
          <p className="text-sm text-loam-500">{t('soil.plants.summary_empty')}</p>
        ) : (
          <>
            <ul className="space-y-2.5">
              {summary.map((entry) => {
                const max = summary[0].score || 1
                return (
                  <li key={entry.key} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-loam-800">{indicatorLabel(entry.key)}</span>
                      {entry.unverified && <span className="text-xs text-loam-500">{t('soil.plants.unverified_short')}</span>}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-loam-100" aria-hidden>
                      <div className="h-full rounded-full bg-leaf-500" style={{ width: `${Math.max(8, Math.round((entry.score / max) * 100))}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-loam-500">{t('soil.plants.summary_from', { plants: entry.plants.join(', ') })}</p>
                    <p className="text-xs text-loam-500">{t(`soil.indicators.${entry.key}.hint`)}</p>
                  </li>
                )
              })}
            </ul>
            <p className="rounded-lg bg-humus-50 p-2.5 text-xs text-humus-700">{t('soil.plants.caveat')}</p>
          </>
        )}
      </section>

      <section className="space-y-2" aria-label={t('soil.plants.observed_title')}>
        <h3 className="text-sm font-semibold text-loam-800">{t('soil.plants.observed_title')}</h3>
        {!observationsLoaded ? (
          <p className="flex items-center gap-2 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('soil.panel.loading')}</p>
        ) : observations.length === 0 ? (
          <p className="text-sm text-loam-500">{t('soil.plants.observed_empty')}</p>
        ) : (
          <ul className="space-y-2">
            {observations.map((observation) => <ObservationRow key={observation.id} observation={observation} />)}
          </ul>
        )}
      </section>

      {catalog.length > 0 && <CatalogBrowser catalog={catalog} />}
    </div>
  )
}

function ObservationForm() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [draft, setDraft] = useState<ObservationDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = draft.speciesName.trim()

  async function add() {
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      await soilActions.saveObservation(mapId, { ...draft, speciesName: name }, null)
      setDraft(EMPTY_DRAFT)
      editor.notify(t('soil.plants.added'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function addPlaced() {
    if (!name) return
    soilActions.startPlacing({ kind: 'new-observation', draft: { ...draft, speciesName: name } })
    setDraft(EMPTY_DRAFT)
  }

  return (
    <form className="space-y-3 rounded-xl bg-loam-50 p-3.5" onSubmit={(e) => { e.preventDefault(); add() }} aria-label={t('soil.plants.form_title')}>
      <h3 className="text-sm font-semibold text-loam-800">{t('soil.plants.form_title')}</h3>
      <SpeciesCombobox mapId={mapId} draft={draft} onChange={setDraft} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-loam-600">{t('soil.plants.abundance')}</span>
          <Select value={draft.abundance} onChange={(e) => setDraft({ ...draft, abundance: e.target.value as Abundance })}>
            {ABUNDANCES.map((a) => <option key={a} value={a}>{t(`soil.abundances.${a}`)}</option>)}
          </Select>
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-loam-600">{t('soil.plants.notes')}</span>
          <Input value={draft.notes} maxLength={500} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-clay-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!name || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {t('soil.plants.add')}
        </Button>
        <Button size="sm" variant="secondary" disabled={!name || busy} onClick={addPlaced}>
          <MapPin className="h-4 w-4" aria-hidden />
          {t('soil.plants.add_placed')}
        </Button>
      </div>
    </form>
  )
}

/** The species field: suggestions from the bio-indicator list first, then the plant catalogue when there is one. */
function SpeciesCombobox({ mapId, draft, onChange }: { mapId: number; draft: ObservationDraft; onChange: (draft: ObservationDraft) => void }) {
  const listId = useId()
  const [options, setOptions] = useState<Option[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searched, setSearched] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const text = draft.speciesName.trim()

  useEffect(() => {
    if (text.length < 2) {
      setOptions([])
      setSearched('')
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const data = await api<{ catalog: CatalogPlant[]; plants: PlantSuggestion[] }>(`/maps/${mapId}/bioindicator_observations/species?q=${encodeURIComponent(text)}`)
        if (cancelled) return
        setOptions([
          ...data.catalog.map((plant) => ({ kind: 'catalog' as const, key: `c-${plant.key}`, plant })),
          ...data.plants.map((plant) => ({ kind: 'plant' as const, key: `p-${plant.id}`, plant })),
        ])
        setSearched(text)
        setActive(-1)
      } catch {
        if (!cancelled) setOptions([])
      }
    }, 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [text, mapId])

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function choose(option: Option) {
    if (option.kind === 'catalog') {
      onChange({ ...draft, speciesName: option.plant.name, latinName: option.plant.latin, catalogKey: option.plant.key, plantSpeciesId: null })
    } else {
      onChange({ ...draft, speciesName: option.plant.name, latinName: option.plant.latin, catalogKey: null, plantSpeciesId: option.plant.id })
    }
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault()
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1))
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault()
      choose(options[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && options.length > 0
  // Not tied to `open`: the hint vanishing on blur would shift the buttons under the pointer between mousedown and mouseup.
  const noMatch = text.length >= 2 && searched === text && options.length === 0

  return (
    <div ref={box} className="relative">
      <label className="block space-y-1">
        <span className="block text-xs font-medium text-loam-600">{t('soil.plants.species')}</span>
        <Input
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" autoComplete="off" maxLength={120}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          value={draft.speciesName} placeholder={t('soil.plants.species_placeholder')}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          onChange={(e) => { setOpen(true); onChange({ ...draft, speciesName: e.target.value, latinName: null, catalogKey: null, plantSpeciesId: null }) }}
        />
      </label>
      {draft.latinName && <p className="mt-1 text-xs italic text-loam-500">{draft.latinName}</p>}
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-loam-200">
          {options.map((option, index) => (
            <li
              key={option.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}
              onMouseDown={(e) => { e.preventDefault(); choose(option) }} onMouseEnter={() => setActive(index)}
              className={clsx('cursor-pointer px-3 py-2 text-sm', index === active && 'bg-prune-50')}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-loam-900">{option.plant.name}</span>
                <span className="shrink-0 text-[11px] text-loam-400">{option.kind === 'catalog' ? t('soil.plants.suggestion_catalog') : t('soil.plants.suggestion_plant')}</span>
              </span>
              {option.plant.latin && <span className="block text-xs italic text-loam-500">{option.plant.latin}</span>}
              {option.kind === 'catalog' && <IndicatorChips keys={option.plant.indicates} unverified={option.plant.unverified} className="mt-1" />}
            </li>
          ))}
        </ul>
      )}
      {noMatch && <p className="mt-1 text-xs text-loam-500">{t('soil.plants.no_match')}</p>}
    </div>
  )
}

function ObservationRow({ observation }: { observation: BioObservation }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const located = observation.lng != null && observation.lat != null

  async function changeAbundance(abundance: Abundance) {
    try {
      await soilActions.patchObservation(mapId, observation.id, { abundance })
    } catch (e) {
      editor.notify((e as Error).message, 'error')
    }
  }

  async function destroy() {
    if (!window.confirm(t('soil.plants.confirm_delete'))) return
    try {
      await soilActions.deleteObservation(mapId, observation.id)
      editor.notify(t('soil.plants.deleted'))
    } catch (e) {
      editor.notify((e as Error).message, 'error')
    }
  }

  async function openPhoto() {
    if (!observation.photoId) return
    await photoActions.load(mapId)
    photoActions.open(observation.photoId)
  }

  function locate() {
    if (located) editor.instance.easeTo({ center: [observation.lng as number, observation.lat as number], zoom: Math.max(editor.instance.getZoom(), 18), offset: visibleOffset(true) })
  }

  return (
    <li className="space-y-1.5 rounded-xl border border-loam-100 bg-white p-2.5 text-sm">
      <div className="flex items-start gap-2">
        {observation.photoId ? (
          <button type="button" onClick={openPhoto} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg" aria-label={t('soil.plants.photo.open', { name: observation.speciesName })}>
            <img src={photoUrl(mapId, observation.photoId, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ) : (
          <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-humus-500" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-loam-900">{observation.speciesName}</p>
          {observation.latinName && <p className="text-xs italic text-loam-500">{observation.latinName}</p>}
        </div>
        {editor.canEdit ? (
          <div className="w-32 shrink-0">
            <Select value={observation.abundance} aria-label={t('soil.plants.abundance')} className="py-1 text-xs" onChange={(e) => changeAbundance(e.target.value as Abundance)}>
              {ABUNDANCES.map((a) => <option key={a} value={a}>{t(`soil.abundances.${a}`)}</option>)}
            </Select>
          </div>
        ) : (
          <span className="rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600">{t(`soil.abundances.${observation.abundance}`)}</span>
        )}
      </div>
      <IndicatorChips keys={observation.indicators} unverified={observation.unverified} />
      {observation.notes && <p className="text-xs text-loam-600">{observation.notes}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-loam-500">
        <span>{[observation.observedOn ? formatDate(observation.observedOn) : null, observation.observedBy].filter(Boolean).join(' · ')}</span>
        <span className="flex items-center gap-1">
          {located ? (
            <button type="button" onClick={locate} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-prune-700 hover:bg-prune-50">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {t('soil.plants.locate')}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-humus-700"><MapPinOff className="h-3.5 w-3.5" aria-hidden />{t('soil.plants.not_placed')}</span>
          )}
          {editor.canEdit && (
            <>
              <button type="button" onClick={() => soilActions.startPlacing({ kind: 'observation', id: observation.id })} className="rounded-md px-1.5 py-1 text-prune-700 hover:bg-prune-50">
                {located ? t('soil.sample.move') : t('soil.plants.place')}
              </button>
              <button type="button" onClick={destroy} className="rounded-md p-1 text-clay-500 hover:bg-clay-50" aria-label={t('common.delete')}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )}
        </span>
      </div>
    </li>
  )
}

/** The curated list, by what each plant indicates; « Je l'ai vue » notes it in one tap. */
function CatalogBrowser({ catalog }: { catalog: CatalogPlant[] }) {
  const editor = useEditor()
  const provenance = catalog[0]?.provenance ?? ''
  const [filter, setFilter] = useState<SoilIndicatorKey | 'all'>('all')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const keys = useMemo(() => Array.from(new Set(catalog.flatMap((p) => p.indicates))).sort((a, b) => indicatorLabel(a).localeCompare(indicatorLabel(b), 'fr')), [catalog])
  const shown = filter === 'all' ? catalog : catalog.filter((p) => p.indicates.includes(filter))

  async function seen(plant: CatalogPlant) {
    setBusyKey(plant.key)
    try {
      await soilActions.saveObservation(editor.map.id, { ...EMPTY_DRAFT, speciesName: plant.name, latinName: plant.latin, catalogKey: plant.key }, null)
      editor.notify(t('soil.plants.added'))
    } catch (e) {
      editor.notify((e as Error).message, 'error')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <details className="group rounded-xl border border-loam-100 px-3 py-2.5">
      <summary className="cursor-pointer list-none text-sm font-semibold text-loam-800 [&::-webkit-details-marker]:hidden">{t('soil.plants.catalog_title')}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-loam-500">{t('soil.plants.catalog_hint', { provenance })}</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('soil.plants.catalog_title')}>
          {(['all', ...keys] as const).map((key) => (
            <button
              key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', filter === key ? 'bg-prune-600 text-white' : 'bg-loam-100 text-loam-600 hover:bg-loam-200')}
            >
              {key === 'all' ? t('soil.plants.filter_all') : indicatorLabel(key)}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {shown.map((plant) => (
            <li key={plant.key} className="space-y-1 rounded-lg bg-loam-50 p-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-loam-900">{plant.name}</p>
                  <p className="text-xs italic text-loam-500">{plant.latin}</p>
                </div>
                {editor.canEdit && (
                  <Button size="sm" variant="secondary" disabled={busyKey === plant.key} onClick={() => seen(plant)}>{t('soil.plants.seen')}</Button>
                )}
              </div>
              <IndicatorChips keys={plant.indicates} unverified={plant.unverified} />
              <p className="text-xs text-loam-600">{plant.note}</p>
              <Evidence plant={plant} />
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
