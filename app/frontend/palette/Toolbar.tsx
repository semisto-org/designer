import clsx from 'clsx'
import { ArrowDown, ArrowUp, Columns3, Download, Filter, Layers, Printer, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { strataLabel } from '@/components/plants/format'
import { inputClass } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { StrataDot } from '@/map/plants/strata'
import { columnLabel } from '@/palette/format'
import { activeFilterCount, STRATA_ORDER, STATUSES, type Filters, type ViewSettings } from '@/palette/table'
import type { Strata } from '@/types/plants'

const ROLES = ['food', 'support', 'pioneer', 'hedge', 'ornamental']

type Props = {
  settings: ViewSettings
  schema: { columns: string[]; groups: string[] }
  tags: string[]
  suppliers: string[]
  onChange: (settings: ViewSettings) => void
  onExport: () => void
}

/** Search, filters, grouping, columns and sort of the current view, then its exports. */
export function Toolbar({ settings, schema, tags, suppliers, onChange, onExport }: Props) {
  const filters = settings.filters
  const setFilters = (patch: Partial<Filters>) => onChange({ ...settings, filters: { ...filters, ...patch } })
  const count = activeFilterCount(filters)
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden />
        <span className="sr-only">{t('plant_palette.toolbar.search')}</span>
        <input
          type="search" value={filters.search ?? ''} placeholder={t('plant_palette.toolbar.search')}
          onChange={(e) => setFilters({ search: e.target.value || null })}
          className={clsx(inputClass, 'rounded-full pl-9')}
        />
      </label>

      <Popover
        label={<><Filter className="h-4 w-4" aria-hidden />{count ? t('plant_palette.filters.active', { count }) : t('plant_palette.toolbar.filters')}</>}
        active={count > 0}
      >
        <div className="w-[min(22rem,calc(100vw-2rem))] space-y-4 text-sm">
          <FilterGroup title={t('plant_palette.filters.status')}>
            {STATUSES.map((s) => (
              <Chip key={s} on={filters.statuses.includes(s)} onClick={() => setFilters({ statuses: toggle(filters.statuses, s) })}>{t(`plant_palette.statuses.${s}`)}</Chip>
            ))}
          </FilterGroup>
          <FilterGroup title={t('plant_palette.filters.strata')}>
            {STRATA_ORDER.map((s) => (
              <Chip key={s} on={filters.strata.includes(s)} onClick={() => setFilters({ strata: toggle(filters.strata, s) })}>
                <StrataDot strata={s as Strata} />{strataLabel(s)}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title={t('plant_palette.filters.role')}>
            {ROLES.map((r) => (
              <Chip key={r} on={filters.roles.includes(r)} onClick={() => setFilters({ roles: toggle(filters.roles, r) })}>{t(`palette.roles.${r}`)}</Chip>
            ))}
          </FilterGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium text-loam-700">{t('plant_palette.filters.tag')}</span>
              <select
                className={clsx(inputClass, 'pr-8')}
                value={filters.untagged ? '__untagged' : filters.tag ?? ''}
                onChange={(e) => setFilters(e.target.value === '__untagged' ? { tag: null, untagged: true } : { tag: e.target.value || null, untagged: false })}
              >
                <option value="">{t('plant_palette.filters.tag_any')}</option>
                {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                <option value="__untagged">{t('tags.untagged')}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-loam-700">{t('plant_palette.filters.supplier')}</span>
              <select className={clsx(inputClass, 'pr-8')} value={filters.supplier ?? ''} onChange={(e) => setFilters({ supplier: e.target.value || null })}>
                <option value="">{t('plant_palette.filters.supplier_any')}</option>
                {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded accent-prune-600" checked={filters.to_plant_only} onChange={(e) => setFilters({ to_plant_only: e.target.checked })} />
            {t('plant_palette.filters.to_plant_only')}
          </label>
          {count > 0 && (
            <button
              type="button" className="inline-flex items-center gap-1 text-prune-700 underline underline-offset-2"
              onClick={() => setFilters({ statuses: [], strata: [], roles: [], tag: null, untagged: false, supplier: null, to_plant_only: false })}
            >
              <X className="h-4 w-4" aria-hidden />{t('plant_palette.toolbar.clear_filters')}
            </button>
          )}
        </div>
      </Popover>

      <label className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-3 pr-1 text-sm text-loam-700 ring-1 ring-inset ring-loam-200">
        <Layers className="h-4 w-4 text-loam-500" aria-hidden />
        <span className="sr-only sm:not-sr-only">{t('plant_palette.toolbar.group')}</span>
        <select
          value={settings.group_by} onChange={(e) => onChange({ ...settings, group_by: e.target.value })}
          className="rounded-full border-0 bg-transparent py-1 pl-1 pr-7 text-sm font-medium text-loam-900 focus:ring-2 focus:ring-prune-600"
        >
          {schema.groups.map((g) => <option key={g} value={g}>{t(`plant_palette.groups.${g}`)}</option>)}
        </select>
      </label>

      <Popover label={<><Columns3 className="h-4 w-4" aria-hidden />{t('plant_palette.toolbar.columns')}</>}>
        <ColumnPicker settings={settings} all={schema.columns} onChange={onChange} />
      </Popover>

      <label className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-sm text-loam-700 ring-1 ring-inset ring-loam-200">
        <span className="sr-only sm:not-sr-only">{t('plant_palette.toolbar.sort')}</span>
        <select
          value={settings.sort.key} onChange={(e) => onChange({ ...settings, sort: { ...settings.sort, key: e.target.value } })}
          className="max-w-[10rem] rounded-full border-0 bg-transparent py-1 pl-1 pr-7 text-sm font-medium text-loam-900 focus:ring-2 focus:ring-prune-600"
        >
          {settings.columns.map((c) => <option key={c} value={c}>{columnLabel(c)}</option>)}
        </select>
        <button
          type="button"
          onClick={() => onChange({ ...settings, sort: { ...settings.sort, dir: settings.sort.dir === 'asc' ? 'desc' : 'asc' } })}
          className="rounded-full p-1.5 text-loam-600 hover:bg-loam-50"
          aria-label={settings.sort.dir === 'asc' ? t('plant_palette.toolbar.ascending') : t('plant_palette.toolbar.descending')}
          title={settings.sort.dir === 'asc' ? t('plant_palette.toolbar.ascending') : t('plant_palette.toolbar.descending')}
        >
          {settings.sort.dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </button>
      </label>

      <div className="ml-auto flex gap-1">
        <button type="button" onClick={onExport} className="rounded-full p-2 text-loam-600 hover:bg-loam-100" title={t('plant_palette.toolbar.export_csv')} aria-label={t('plant_palette.toolbar.export_csv')}>
          <Download className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => window.print()} className="rounded-full p-2 text-loam-600 hover:bg-loam-100" title={t('plant_palette.toolbar.print')} aria-label={t('plant_palette.toolbar.print')}>
          <Printer className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Shown columns first, in their order (with arrows to move them), then the others to add. */
function ColumnPicker({ settings, all, onChange }: { settings: ViewSettings; all: string[]; onChange: (s: ViewSettings) => void }) {
  const shown = settings.columns
  const hidden = all.filter((c) => !shown.includes(c))
  const set = (columns: string[]) => onChange({ ...settings, columns })
  const move = (index: number, by: number) => {
    const next = [...shown]
    const [column] = next.splice(index, 1)
    next.splice(index + by, 0, column)
    set(next)
  }
  return (
    <div className="max-h-[60vh] w-64 overflow-y-auto text-sm">
      <ul className="space-y-0.5">
        {shown.map((column, i) => (
          <li key={column} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-loam-50">
            <input
              type="checkbox" checked disabled={column === 'name'} className="h-4 w-4 rounded accent-prune-600"
              onChange={() => set(shown.filter((c) => c !== column))} aria-label={columnLabel(column)}
            />
            <span className="flex-1 text-loam-800">{columnLabel(column)}</span>
            {column !== 'name' && (
              <span className="flex">
                <button type="button" disabled={i <= 1} onClick={() => move(i, -1)} className="rounded p-1 text-loam-500 hover:bg-loam-100 disabled:opacity-30" aria-label={`↑ ${columnLabel(column)}`}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={i === shown.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-loam-500 hover:bg-loam-100 disabled:opacity-30" aria-label={`↓ ${columnLabel(column)}`}><ArrowDown className="h-3.5 w-3.5" /></button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {hidden.length > 0 && <hr className="my-2 border-loam-100" />}
      <ul className="space-y-0.5">
        {hidden.map((column) => (
          <li key={column}>
            <label className="flex items-center gap-2 rounded-lg px-2 py-1 text-loam-600 hover:bg-loam-50">
              <input type="checkbox" checked={false} className="h-4 w-4 rounded accent-prune-600" onChange={() => set([...shown, column])} />
              {columnLabel(column)}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-medium text-loam-700">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm ring-1 ring-inset', on ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-50')}
    >
      {children}
    </button>
  )
}

/** A pill that opens a panel below it; a click outside or Escape closes it. */
export function Popover({ label, children, active = false, align = 'left' }: { label: ReactNode; children: ReactNode; active?: boolean; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button
        type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium ring-1 ring-inset', active ? 'bg-prune-50 text-prune-800 ring-prune-300' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-50')}
      >
        {label}
      </button>
      {open && (
        <div className={clsx('absolute top-full z-30 mt-1.5 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-loam-900/10',
          // A bottom sheet on a phone, so it never runs off the screen.
          'max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:max-h-[75vh] max-sm:overflow-y-auto max-sm:[&>*]:w-full',
          align === 'right' ? 'right-0' : 'left-0')}>
          {children}
        </div>
      )}
    </div>
  )
}
