import clsx from 'clsx'
import { ChevronUp, Layers, RotateCcw, Sprout, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { strataLabel } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { StrataDot } from '@/map/plants/strata'
import { STRATA_ORDER } from '@/palette/table'
import type { Strata } from '@/types/plants'

/** What a selection can change (PlantPalette::Batch on the server). */
export type BatchChange = 'role' | 'strata' | 'planted' | 'delete'
export type BatchKind = 'species' | 'plants'

const ROLES = ['food', 'support', 'pioneer', 'hedge', 'ornamental']
const STATES = ['planned', 'today', 'unknown'] as const

/**
 * Checkbox selection with shift-click ranges, over the rows in the order
 * they are shown: a click toggles one row, a shift-click sets every row
 * between the last one clicked and this one the same way.
 */
export function useRangeSelect<T>(order: T[], selected: Set<T>, onChange: (next: Set<T>) => void) {
  const anchor = useRef<T | null>(null)
  return (id: T, event: MouseEvent<HTMLInputElement>) => {
    const on = !selected.has(id)
    const next = new Set(selected)
    const from = anchor.current == null ? -1 : order.indexOf(anchor.current)
    const to = order.indexOf(id)
    const range = event.shiftKey && from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
    range.forEach((key) => (on ? next.add(key) : next.delete(key)))
    anchor.current = id
    onChange(next)
  }
}

/** The header box: all the rows shown, some of them (indeterminate) or none. */
export function SelectAll({ ids, selected, onChange }: { ids: unknown[]; selected: Set<unknown>; onChange: (all: boolean) => void }) {
  const box = useRef<HTMLInputElement>(null)
  const count = ids.filter((id) => selected.has(id)).length
  useEffect(() => { if (box.current) box.current.indeterminate = count > 0 && count < ids.length }, [count, ids.length])
  return (
    <input
      ref={box} type="checkbox" checked={ids.length > 0 && count === ids.length} disabled={ids.length === 0}
      onChange={(e) => onChange(e.target.checked)} aria-label={t('plant_palette.batch.select_all')} title={t('plant_palette.batch.select_all')}
      className="h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-600"
    />
  )
}

type Props = {
  kind: BatchKind
  count: number
  busy: boolean
  onApply: (change: BatchChange, value: string | null) => void
  onClear: () => void
}

/**
 * The bar that rises from the bottom of the page once plants are selected,
 * like a gardener's hand over the table: the role and strata of species,
 * the state of their plants (planned, in the ground), or deleting them.
 */
export function BatchBar({ kind, count, busy, onApply, onClear }: Props) {
  return (
    <Dock label={t('plant_palette.batch.label')}>
      <span className="mr-1 whitespace-nowrap px-2 font-medium">
        {t(kind === 'species' ? 'plant_palette.batch.selected_species' : 'plant_palette.batch.selected_plants', { count })}
      </span>
      {kind === 'species' && (
        <>
          <Menu icon={<Tag className="h-4 w-4" aria-hidden />} label={t('plant_palette.batch.role')} disabled={busy}>
            {(close) => (
              <>
                <Item onClick={() => { close(); onApply('role', null) }}>{t('palette.role_none')}</Item>
                {ROLES.map((role) => <Item key={role} onClick={() => { close(); onApply('role', role) }}>{t(`palette.roles.${role}`)}</Item>)}
              </>
            )}
          </Menu>
          <Menu icon={<Layers className="h-4 w-4" aria-hidden />} label={t('plant_palette.batch.strata')} disabled={busy}>
            {(close) => (
              <>
                <Item onClick={() => { close(); onApply('strata', null) }}>{t('plant_palette.batch.strata_catalogue')}</Item>
                {STRATA_ORDER.map((strata) => (
                  <Item key={strata} onClick={() => { close(); onApply('strata', strata) }}>
                    <StrataDot strata={strata as Strata} />{strataLabel(strata)}
                  </Item>
                ))}
              </>
            )}
          </Menu>
        </>
      )}
      <Menu icon={<Sprout className="h-4 w-4" aria-hidden />} label={t('plant_palette.batch.state')} disabled={busy}>
        {(close) => (
          <>
            {STATES.map((state) => <Item key={state} onClick={() => { close(); onApply('planted', state) }}>{t(`plant_palette.batch.states.${state}`)}</Item>)}
            <p className="max-w-[16rem] px-2 pt-2 text-sm text-loam-500">{t('plant_palette.batch.state_hint')}</p>
          </>
        )}
      </Menu>
      <button
        type="button" disabled={busy} onClick={() => onApply('delete', null)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-clay-100 hover:bg-clay-700/60 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />{t('plant_palette.batch.delete')}
      </button>
      <button
        type="button" onClick={onClear} title={t('plant_palette.batch.clear')} aria-label={t('plant_palette.batch.clear')}
        className="ml-auto rounded-full p-1.5 text-prune-100 hover:bg-white/10 sm:ml-1"
      >
        <X className="h-4 w-4" />
      </button>
    </Dock>
  )
}

/** What the last action did, with « Annuler » (also ⌘Z / Ctrl+Z) while it can be undone. */
export function BatchToast({ message, onUndo, onClose, busy }: { message: string; onUndo: (() => void) | null; onClose: () => void; busy: boolean }) {
  useEffect(() => {
    if (!onUndo) return
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        onUndo()
      }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [onUndo])

  return (
    <Dock label={message} live>
      <span className="px-2">{message}</span>
      {onUndo && (
        <button
          type="button" disabled={busy} onClick={onUndo}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-prune-800 hover:bg-prune-50 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />{t('plant_palette.batch.undo')}
        </button>
      )}
      <button type="button" onClick={onClose} aria-label={t('plant_palette.sheet.close')} className="ml-auto rounded-full p-1.5 text-prune-100 hover:bg-white/10 sm:ml-1">
        <X className="h-4 w-4" />
      </button>
    </Dock>
  )
}

function Dock({ label, live = false, children }: { label: string; live?: boolean; children: ReactNode }) {
  return (
    <div
      role={live ? 'status' : 'toolbar'} aria-label={label}
      className="fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center gap-1 rounded-2xl bg-prune-900 px-2 py-2 text-sm text-white shadow-xl ring-1 ring-black/10 sm:inset-x-auto sm:left-1/2 sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:rounded-full print:hidden"
    >
      {children}
    </div>
  )
}

/** A choice list that opens above the bar, and closes once a choice is made. */
function Menu({ icon, label, disabled, children }: { icon: ReactNode; label: string; disabled: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: globalThis.MouseEvent | KeyboardEvent) => {
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
        type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-white/10 disabled:opacity-50', open && 'bg-white/15')}
      >
        {icon}{label}<ChevronUp className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 max-h-[60vh] min-w-[13rem] overflow-y-auto max-sm:fixed max-sm:inset-x-4 max-sm:bottom-28 rounded-2xl bg-white p-1.5 text-loam-800 shadow-lg ring-1 ring-loam-900/10">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function Item({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-left text-sm hover:bg-loam-50">
      {children}
    </button>
  )
}
