import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { MapPin, Search } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatDate, todayIso } from '@/components/plants/format'
import { inputClass } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { SelectAll, useRangeSelect } from '@/palette/BatchBar'
import { filterPlants, parsePlanted, plantedInput, type PlantFilters, type PlantLine, type PlantedPatch } from '@/palette/plants'
import type { MapFeature } from '@/types'

type Saved = MapFeature & { swapped?: MapFeature }

type Props = {
  mapId: number
  plants: PlantLine[]
  tags: string[]
  canEdit: boolean
  /** One plant (or two, after a swap) as the server now has them. */
  onSaved: (lines: Partial<PlantLine>[]) => void
  /** Its status or planting date changed: the species quantities did too. */
  onPlantedChanged: () => void
  onStatus: (message: string | null, error?: boolean) => void
  /** Plants chosen for an action on the selection (editors only), by id. */
  selected?: Set<number>
  onSelect?: (next: Set<number>) => void
}

const lineOf = (feature: MapFeature): Partial<PlantLine> => {
  const p = feature.properties
  const precision = p.planted_on_precision
  return {
    id: p.id, number: typeof p.number === 'number' ? p.number : Number(p.number) || null,
    plantedOn: typeof p.planted_on === 'string' ? p.planted_on : null,
    plantedPrecision: precision === 'year' || precision === 'unknown' ? precision : null,
    lockVersion: p.lockVersion,
  }
}

/**
 * « Plant par plant »: every plant point of the map with its number on the
 * plan, its status and planting date, all three edited in place. Typing a
 * number and Enter jumps to the next plant, so a whole plan is renumbered
 * from the keyboard; a number another plant holds swaps the two.
 */
export function PlantsTable({ mapId, plants, tags, canEdit, onSaved, onPlantedChanged, onStatus, selected, onSelect }: Props) {
  const [filters, setFilters] = useState<PlantFilters>({ search: '', status: '', tag: '' })
  const shown = useMemo(() => filterPlants(plants, filters), [plants, filters])
  const table = useRef<HTMLTableElement>(null)
  const chosen = selected ?? new Set<number>()
  const selecting = onSelect != null
  const order = shown.map((plant) => plant.id)
  const toggle = useRangeSelect(order, chosen, onSelect ?? (() => {}))

  async function save(plant: PlantLine, body: Record<string, unknown>): Promise<Saved | null> {
    try {
      const saved = await api<Saved>(`/maps/${mapId}/features/${plant.id}`, {
        method: 'PATCH', body: { feature: { ...body, lock_version: plant.lockVersion } },
      })
      onSaved(saved.swapped ? [lineOf(saved), lineOf(saved.swapped)] : [lineOf(saved)])
      return saved
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data.feature) {
        onSaved([lineOf(e.data.feature as MapFeature)])
        onStatus(t('plant_palette.plants.stale'), true)
      } else {
        onStatus(e instanceof Error ? e.message : t('plant_palette.errors.generic'), true)
      }
      return null
    }
  }

  async function renumber(plant: PlantLine, number: number) {
    const saved = await save(plant, { properties_patch: { number }, swap_number: true })
    if (!saved) return
    const other = saved.swapped?.properties.number
    onStatus(other != null ? t('plant_palette.plants.swapped', { number: String(number), other: String(other) }) : null)
  }

  async function setPlanted(plant: PlantLine, patch: PlantedPatch | null) {
    const saved = await save(plant, { properties_patch: patch ?? { planted_on: null, planted_on_precision: null } })
    if (saved) { onStatus(null); onPlantedChanged() }
  }

  /** Enter in a number field: on to the next plant's (leaving the field saves it); false on the last one. */
  function focusNext(id: number): boolean {
    const fields = [...(table.current?.querySelectorAll<HTMLInputElement>('input[data-plant-number]') ?? [])]
    const index = fields.findIndex((field) => field.dataset.plantNumber === String(id))
    const next = fields[index + 1]
    if (!next) return false
    next.focus()
    return true
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-loam-600">{canEdit ? t('plant_palette.plants.intro') : t('plant_palette.plants.intro_read_only')}</p>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden />
          <input
            type="search" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder={t('plant_palette.plants.search')} aria-label={t('plant_palette.plants.search')}
            className={clsx(inputClass, 'pl-9')}
          />
        </label>
        <select
          value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as PlantFilters['status'] }))}
          aria-label={t('plant_palette.plants.columns.status')} className={clsx(inputClass, '!w-auto !pr-9')}
        >
          <option value="">{t('plant_palette.plants.all_statuses')}</option>
          <option value="planned">{t('plant_palette.plants.statuses.planned')}</option>
          <option value="planted">{t('plant_palette.plants.statuses.planted')}</option>
        </select>
        {tags.length > 0 && (
          <select
            value={filters.tag} onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
            aria-label={t('plant_palette.plants.columns.tags')} className={clsx(inputClass, '!w-auto !pr-9')}
          >
            <option value="">{t('plant_palette.plants.all_tags')}</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        )}
        <span className="text-sm text-loam-500">{t('plant_palette.plants.count', { count: shown.length })}</span>
      </div>

      {plants.length === 0 || shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-loam-300 bg-white/60 px-6 py-10 text-center text-sm text-loam-500">
          {plants.length === 0 ? t('plant_palette.plants.none') : t('plant_palette.plants.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-loam-900/10 print:overflow-visible print:shadow-none print:ring-0">
          <table ref={table} className="w-full min-w-max border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-loam-50/95 backdrop-blur">
              <tr>
                {selecting && (
                  <th scope="col" className="w-10 border-b border-loam-900/10 py-2.5 pl-3 pr-1 text-left print:hidden">
                    <SelectAll
                      ids={order} selected={chosen as Set<unknown>}
                      onChange={(all) => onSelect(all ? new Set([...chosen, ...order]) : new Set([...chosen].filter((id) => !order.includes(id))))}
                    />
                  </th>
                )}
                {(['number', 'plant', 'status', 'planted', 'tags'] as const).map((column) => (
                  <th key={column} scope="col" className={clsx('border-b border-loam-900/10 px-3 py-2.5 text-left font-medium text-loam-600', column === 'number' && 'w-24')}>
                    {t(`plant_palette.plants.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((plant) => (
                <tr key={plant.id} className={clsx('border-b border-loam-100 last:border-0', chosen.has(plant.id) ? 'bg-prune-50/70' : 'hover:bg-loam-50/60')}>
                  {selecting && (
                    <td className="w-10 py-2 pl-3 pr-1 align-middle print:hidden">
                      <input
                        type="checkbox" checked={chosen.has(plant.id)} onChange={() => {}} onClick={(e) => toggle(plant.id, e)}
                        aria-label={t('plant_palette.batch.select_row', { name: [plant.number && `n° ${plant.number}`, plant.species ?? plant.name].filter(Boolean).join(' · ') })}
                        className="h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-600"
                      />
                    </td>
                  )}
                  <td className="p-1 pl-2">
                    {canEdit ? (
                      <NumberField plant={plant} onCommit={renumber} onNext={focusNext} onInvalid={() => onStatus(t('plant_palette.plants.number_invalid'), true)} />
                    ) : (
                      <span className="px-2 font-medium tabular-nums text-loam-900">{plant.number ?? '—'}</span>
                    )}
                  </td>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0">
                        <span className={clsx('block font-medium', plant.species ? 'text-loam-900' : 'text-loam-500')}>{plant.species ?? t('plant_palette.plants.no_species')}</span>
                        {plant.name && plant.name !== plant.species && <span className="block text-loam-500">{plant.name}</span>}
                      </span>
                      <Link
                        href={`/maps/${mapId}?feature=${plant.id}`} title={t('plant_palette.plants.show_on_map')} aria-label={t('plant_palette.plants.show_on_map')}
                        className="ml-auto shrink-0 rounded-full p-1.5 text-loam-400 hover:bg-loam-100 hover:text-prune-700 print:hidden"
                      >
                        <MapPin className="h-4 w-4" />
                      </Link>
                    </span>
                  </th>
                  <td className="p-1">
                    {canEdit ? (
                      <select
                        value={plant.plantedOn ? 'planted' : 'planned'}
                        onChange={(e) => void setPlanted(plant, e.target.value === 'planted' ? { planted_on: todayIso(), planted_on_precision: 'unknown' } : null)}
                        aria-label={`${t('plant_palette.plants.columns.status')} · ${plant.number ?? ''}`}
                        className={clsx(
                          'rounded-full border-0 py-1 pl-3 pr-8 text-sm ring-1 ring-inset focus:ring-2 focus:ring-prune-600',
                          plant.plantedOn ? 'bg-leaf-50 text-leaf-800 ring-leaf-200' : 'bg-humus-50 text-humus-800 ring-humus-200',
                        )}
                      >
                        <option value="planned">{t('plant_palette.plants.statuses.planned')}</option>
                        <option value="planted">{t('plant_palette.plants.statuses.planted')}</option>
                      </select>
                    ) : (
                      <span className="px-2">{t(`plant_palette.plants.statuses.${plant.plantedOn ? 'planted' : 'planned'}`)}</span>
                    )}
                  </td>
                  <td className="p-1">
                    {plant.plantedOn ? (
                      canEdit
                        ? <PlantedField plant={plant} onCommit={setPlanted} onInvalid={() => onStatus(t('plant_palette.plants.date_invalid'), true)} />
                        : <span className="px-2 text-loam-700">{plantedText(plant)}</span>
                    ) : (
                      <span className="px-2 text-loam-300">{t('plant_palette.cells.empty')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {plant.tags.map((tag) => <span key={tag} className="whitespace-nowrap rounded-full bg-lichen-50 px-2 py-0.5 text-sm text-loam-700 ring-1 ring-inset ring-lichen-200">{tag}</span>)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const plantedText = (plant: PlantLine) => {
  if (plant.plantedPrecision === 'unknown') return t('plant_palette.plants.date_unknown')
  return plant.plantedPrecision === 'year' ? plant.plantedOn!.slice(0, 4) : formatDate(plant.plantedOn)
}

function NumberField({ plant, onCommit, onNext, onInvalid }: {
  plant: PlantLine
  onCommit: (plant: PlantLine, number: number) => Promise<void>
  onNext: (id: number) => boolean
  onInvalid: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? (plant.number != null ? String(plant.number) : '')
  const commit = () => {
    if (draft == null) return
    setDraft(null)
    const number = Number(draft.trim())
    if (draft.trim() === '' || number === plant.number) return
    if (!Number.isInteger(number) || number < 1) return onInvalid()
    void onCommit(plant, number)
  }
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const field = event.currentTarget
      if (!onNext(plant.id)) field.blur()
    }
    if (event.key === 'Escape') setDraft(null)
  }
  return (
    <input
      value={value} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} onFocus={(e) => e.target.select()}
      inputMode="numeric" data-plant-number={plant.id} aria-label={`${t('plant_palette.plants.columns.number')} · ${plant.species ?? ''}`}
      className={clsx(inputClass, 'w-20 py-1.5 text-right font-medium tabular-nums')}
    />
  )
}

/** The planting date, read like text, a field on click: a year, a date, or empty for « date inconnue ». */
function PlantedField({ plant, onCommit, onInvalid }: {
  plant: PlantLine
  onCommit: (plant: PlantLine, patch: PlantedPatch) => Promise<void>
  onInvalid: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft == null) return
    setDraft(null)
    if (draft.trim() === plantedInput(plant)) return
    const patch = parsePlanted(draft, todayIso())
    if (!patch) return onInvalid()
    void onCommit(plant, patch)
  }
  if (draft != null) {
    return (
      <input
        autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }}
        placeholder={t('plant_palette.plants.date_placeholder')} title={t('plant_palette.plants.date_hint')}
        aria-label={`${t('plant_palette.plants.columns.planted')} · ${plant.number ?? ''}`}
        className={clsx(inputClass, 'min-w-[12rem] py-1.5')}
      />
    )
  }
  return (
    <button
      type="button" onClick={() => setDraft(plantedInput(plant))} title={t('plant_palette.plants.date_hint')}
      className={clsx(
        'block w-full min-w-[10rem] whitespace-nowrap rounded-lg px-2 py-1.5 text-left ring-1 ring-inset ring-transparent hover:bg-white hover:ring-loam-200',
        plant.plantedPrecision === 'unknown' ? 'text-loam-500' : 'text-loam-800',
      )}
    >
      {plantedText(plant)}
    </button>
  )
}
