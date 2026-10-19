import clsx from 'clsx'
import { ArrowDown, ArrowUp, TreeDeciduous } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { inputClass } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { StrataDot } from '@/map/plants/strata'
import { SelectAll, useRangeSelect } from '@/palette/BatchBar'
import { ExclusionFlag, FitChips } from '@/palette/Fit'
import { columnLabel, displayTotal, displayValue, groupLabel, NUMERIC } from '@/palette/format'
import { statusOf, totals, type Group, type PaletteRow, type PlantStatus, type ViewSettings } from '@/palette/table'
import type { Strata } from '@/types/plants'

/** The palette item's fields an editor sets right in the table. */
export const EDITABLE = new Set(['role', 'unit_price', 'supplier', 'size', 'target', 'notes'])
const ROLES = ['food', 'support', 'pioneer', 'hedge', 'ornamental']

const STATUS_TONES: Record<PlantStatus, string> = {
  existing: 'bg-loam-100 text-loam-700 ring-loam-200',
  chosen: 'bg-white text-prune-700 ring-prune-200',
  planned: 'bg-humus-50 text-humus-800 ring-humus-200',
  planting: 'bg-leaf-50 text-leaf-800 ring-leaf-200',
  planted: 'bg-leaf-600 text-white ring-leaf-600',
}

type Props = {
  groups: Group[]
  settings: ViewSettings
  canEdit: boolean
  suppliers: string[]
  onOpen: (row: PaletteRow) => void
  onSort: (key: string) => void
  onEdit: (row: PaletteRow, field: string, value: string | null) => Promise<boolean>
  /** Rows chosen for an action on the selection (editors only), by key. */
  selected?: Set<string>
  onSelect?: (next: Set<string>) => void
}

/** Species rows can be selected; an existing tree outside the catalogue cannot. */
export const selectable = (row: PaletteRow) => row.speciesId != null

/** The table itself: sticky header, one band per group with its subtotal, the grand total at the bottom. */
export function PaletteTable({ groups, settings, canEdit, suppliers, onOpen, onSort, onEdit, selected, onSelect }: Props) {
  const columns = settings.columns
  const all = groups.flatMap((g) => g.rows)
  const grand = totals(all, columns)
  const grouped = settings.group_by !== 'none'
  const selecting = selected != null && onSelect != null
  const order = [...new Set(all.filter(selectable).map((row) => row.key))]
  const toggle = useRangeSelect(order, selected ?? new Set<string>(), onSelect ?? (() => {}))
  const span = columns.length + (selecting ? 1 : 0)
  // Without a fit column, an invasive or toxic plant says so under its name.
  const flagInName = !columns.includes('fit')
  const [frame, more] = useMoreToTheRight()

  return (
    <div className="relative">
    <div ref={frame} className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-loam-900/10 print:overflow-visible print:shadow-none print:ring-0">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-loam-50/95 backdrop-blur">
          <tr>
            {selecting && (
              <th scope="col" className="sticky left-0 z-10 w-10 border-b border-loam-900/10 bg-loam-50 py-2.5 pl-3 pr-1 text-left print:hidden">
                <SelectAll
                  ids={order} selected={selected as Set<unknown>}
                  onChange={(all) => onSelect(all ? new Set([...selected, ...order]) : new Set([...selected].filter((key) => !order.includes(key))))}
                />
              </th>
            )}
            {columns.map((column) => {
              const sorted = settings.sort.key === column
              const hint = t(`plant_palette.column_hints.${column}`)
              return (
                <th
                  key={column} scope="col"
                  aria-sort={sorted ? (settings.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={clsx('border-b border-loam-900/10 px-3 py-2.5 font-medium text-loam-600', NUMERIC.has(column) ? 'text-right' : 'text-left', column === 'name' && clsx('sticky z-10 bg-loam-50', selecting ? 'left-10 print:left-0' : 'left-0'))}
                >
                  <button
                    type="button" onClick={() => onSort(column)}
                    title={hint.startsWith('⟨') || hint === column ? undefined : hint}
                    className="inline-flex items-center gap-1 whitespace-nowrap hover:text-loam-900 print:pointer-events-none"
                  >
                    {columnLabel(column)}
                    {sorted && (settings.sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        {groups.map((group) => {
          const sums = totals(group.rows, columns)
          return (
            <tbody key={group.key ?? '\u0000'}>
              {grouped && (
                <tr className="bg-prune-50/40">
                  <th colSpan={span} scope="colgroup" className="px-3 pb-1.5 pt-4 text-left">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-prune-800">
                        {settings.group_by === 'strata' && group.key && <StrataDot strata={group.key as Strata} />}
                        {groupLabel(settings.group_by, group.key)}
                      </span>
                      <span className="text-sm font-normal text-loam-500">{t('plant_palette.group_count', { count: group.rows.length })}</span>
                      {Object.entries(sums).filter(([c, v]) => v > 0 && (c === 'planned' || c === 'amount' || c === 'amount_to_plant' || c === 'to_plant')).map(([c, v]) => (
                        <span key={c} className="text-sm font-normal text-loam-500">{columnLabel(c)} : <span className="font-medium tabular-nums text-loam-800">{displayTotal(c, v)}</span></span>
                      ))}
                    </span>
                  </th>
                </tr>
              )}
              {group.rows.map((row) => {
                const on = selecting && selected.has(row.key)
                return (
                  <tr key={`${group.key ?? ''}|${row.key}`} className={clsx('group/row border-b border-loam-100 last:border-0', on ? 'bg-prune-50/70' : 'hover:bg-loam-50/60')}>
                    {selecting && (
                      <td className={clsx('sticky left-0 z-[1] w-10 py-2 pl-3 pr-1 align-middle print:hidden', on ? 'bg-prune-50' : 'bg-white group-hover/row:bg-loam-50')}>
                        <input
                          type="checkbox" checked={on} disabled={!selectable(row)}
                          onChange={() => {}} onClick={(e) => toggle(row.key, e)}
                          aria-label={t('plant_palette.batch.select_row', { name: row.name })}
                          title={selectable(row) ? undefined : t('plant_palette.batch.not_selectable')}
                          className="h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-600 disabled:opacity-40"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <Cell key={column} row={row} column={column} canEdit={canEdit && row.speciesId != null} suppliers={suppliers} onOpen={onOpen} onEdit={onEdit} stickyLeft={selecting ? 'left-10 print:left-0' : 'left-0'} on={on} flagInName={flagInName} />
                    ))}
                  </tr>
                )
              })}
            </tbody>
          )
        })}
        {Object.keys(grand).length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-loam-900/15 bg-loam-50/80 font-semibold text-loam-900">
              {selecting && <td className="sticky left-0 w-10 bg-loam-50 print:hidden" />}
              {columns.map((column, i) => (
                <td key={column} className={clsx('px-3 py-2.5 tabular-nums', NUMERIC.has(column) ? 'text-right' : 'text-left', i === 0 && clsx('sticky bg-loam-50', selecting ? 'left-10 print:left-0' : 'left-0'))}>
                  {i === 0 ? t('plant_palette.totals') : column in grand ? displayTotal(column, grand[column]) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
      {/* More columns to the right: a fade says the table scrolls. */}
      {more && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-2xl bg-gradient-to-l from-white to-transparent print:hidden" />}
    </div>
  )
}

/** A ref for a scrolling frame, and whether some of its content is still hidden to the right. */
function useMoreToTheRight() {
  const frame = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    if (el.firstElementChild) observer?.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', measure); observer?.disconnect() }
  }, [])
  return [frame, more] as const
}

function Cell({ row, column, canEdit, suppliers, onOpen, onEdit, stickyLeft, on, flagInName }: {
  row: PaletteRow; column: string; canEdit: boolean; suppliers: string[]; stickyLeft: string; on: boolean; flagInName: boolean
  onOpen: (row: PaletteRow) => void
  onEdit: (row: PaletteRow, field: string, value: string | null) => Promise<boolean>
}) {
  const numeric = NUMERIC.has(column)
  const base = clsx('px-3 py-2 align-middle', numeric && 'text-right tabular-nums')

  if (column === 'name') {
    return (
      <th scope="row" className={clsx('sticky z-[1] max-w-[11rem] sm:max-w-[18rem] px-3 py-2 text-left font-normal', stickyLeft, on ? 'bg-prune-50' : 'bg-white group-hover/row:bg-loam-50')}>
        <button type="button" onClick={() => onOpen(row)} className="flex w-full min-w-0 items-center gap-2.5 text-left">
          {/* On a phone the name gets the whole width and wraps instead of being cut. */}
          {row.photo
            ? <img src={row.photo} alt="" loading="lazy" className="hidden h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-loam-900/10 sm:block print:hidden" />
            : <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-loam-50 ring-1 ring-loam-900/10 sm:flex print:hidden">
                {row.speciesId == null ? <TreeDeciduous className="h-4 w-4 text-loam-500" aria-hidden /> : <StrataDot strata={row.strata as Strata} />}
              </span>}
          <span className="min-w-0">
            <span className="block break-words font-medium text-prune-800 underline-offset-2 hover:underline sm:truncate">{row.name}</span>
            {row.latinName && row.latinName !== row.name && <span className="block break-words text-sm italic text-loam-500 sm:truncate">{row.latinName}</span>}
            {flagInName && <ExclusionFlag excludedBy={row.excludedBy} className="mt-0.5" />}
          </span>
        </button>
      </th>
    )
  }

  if (column === 'status') {
    const status = statusOf(row)
    return (
      <td className={base}>
        <span className={clsx('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm ring-1 ring-inset', STATUS_TONES[status])}>{t(`plant_palette.statuses.${status}`)}</span>
      </td>
    )
  }

  if (column === 'strata') {
    return (
      <td className={base}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><StrataDot strata={row.strata as Strata} />{displayValue(row, column)}</span>
      </td>
    )
  }

  if (column === 'fit') {
    return (
      <td className={clsx(base, !row.fit && 'text-loam-300')}>
        {row.fit && (row.fit.criteria.length > 0 || row.excludedBy) ? <FitChips fit={row.fit} excludedBy={row.excludedBy} className="flex-nowrap" /> : t('plant_palette.cells.empty')}
      </td>
    )
  }

  if (column === 'tags') {
    return (
      <td className={base}>
        <span className="flex flex-wrap gap-1">
          {row.tags.map((tag) => <span key={tag} className="whitespace-nowrap rounded-full bg-lichen-50 px-2 py-0.5 text-sm text-loam-700 ring-1 ring-inset ring-lichen-200">{tag}</span>)}
        </span>
      </td>
    )
  }

  if (canEdit && EDITABLE.has(column)) {
    return <td className={clsx(base, 'p-1')}><EditableCell row={row} column={column} suppliers={suppliers} onEdit={onEdit} /></td>
  }

  const text = displayValue(row, column)
  return <td className={clsx(base, 'whitespace-nowrap', column === 'notes' && 'max-w-[16rem] truncate whitespace-normal', !text && 'text-loam-300')}>{text || t('plant_palette.cells.empty')}</td>
}

const rawValue = (row: PaletteRow, column: string): string => {
  switch (column) {
    case 'role': return row.role ?? ''
    case 'unit_price': return row.unitPrice == null ? '' : String(row.unitPrice).replace('.', ',')
    case 'supplier': return row.supplier ?? ''
    case 'size': return row.size ?? ''
    case 'target': return row.targetCount == null ? '' : String(row.targetCount)
    case 'notes': return row.notes ?? ''
    default: return ''
  }
}

/** A cell that reads like text and turns into a field on click; Enter or leaving it saves, Escape cancels. */
function EditableCell({ row, column, suppliers, onEdit }: {
  row: PaletteRow; column: string; suppliers: string[]
  onEdit: (row: PaletteRow, field: string, value: string | null) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const numeric = NUMERIC.has(column)
  const start = () => { setDraft(rawValue(row, column)); setEditing(true) }
  const commit = async (value: string) => {
    setEditing(false)
    if (value === rawValue(row, column)) return
    const clean = value.trim()
    await onEdit(row, column, clean === '' ? null : numeric ? clean.replace(',', '.').replace(/\s/g, '') : clean)
  }
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void commit(draft)
    if (event.key === 'Escape') setEditing(false)
  }

  if (column === 'role') {
    return (
      <select
        value={row.role ?? ''} aria-label={`${t('plant_palette.columns.role')} · ${row.name}`}
        onChange={(e) => void onEdit(row, 'role', e.target.value || null)}
        className="w-full min-w-[12rem] rounded-lg border-0 bg-transparent py-1.5 pl-2 pr-8 text-sm text-loam-800 ring-1 ring-inset ring-transparent hover:ring-loam-200 focus:ring-2 focus:ring-prune-600"
      >
        <option value="">{t('palette.role_none')}</option>
        {ROLES.map((role) => <option key={role} value={role}>{t(`palette.roles.${role}`)}</option>)}
      </select>
    )
  }

  if (editing) {
    const listId = column === 'supplier' ? 'palette-suppliers' : undefined
    return (
      <>
        <input
          autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void commit(draft)} onKeyDown={keys}
          inputMode={column === 'target' ? 'numeric' : numeric ? 'decimal' : undefined} list={listId}
          placeholder={column === 'unit_price' ? t('plant_palette.cells.price_placeholder') : undefined}
          aria-label={`${t(`plant_palette.columns.${column}`)} · ${row.name}`}
          className={clsx(inputClass, 'min-w-[7rem] py-1.5', numeric && 'text-right')}
        />
        {listId && <datalist id={listId}>{suppliers.map((s) => <option key={s} value={s} />)}</datalist>}
      </>
    )
  }

  const text = displayValue(row, column)
  return (
    <button
      type="button" onClick={start} title={t('plant_palette.cells.editable')}
      className={clsx(
        'block w-full min-w-[6rem] rounded-lg px-2 py-1.5 ring-1 ring-inset ring-transparent hover:bg-white hover:ring-loam-200',
        numeric ? 'text-right tabular-nums' : 'text-left', column === 'notes' ? 'max-w-[16rem] truncate' : 'whitespace-nowrap',
        // An empty cell invites to write in it: there is no hover on a phone.
        text ? 'text-loam-800' : 'text-loam-400 outline-dashed outline-1 -outline-offset-1 outline-loam-200 hover:outline-none',
      )}
    >
      {text || t('plant_palette.cells.add')}
    </button>
  )
}
