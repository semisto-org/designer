import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { ELEMENT_LAYERS, elementFor } from '@/map/drawing/catalog'
import { iconComponent } from '@/map/drawing/icons'
import type { ElementSpec } from '@/types/drawing'

const RECENT_KEY = 'designer:drawing:recent'

export function loadRecent(): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((k) => typeof k === 'string' && elementFor(k)) : []
  } catch {
    return []
  }
}

export function rememberRecent(kind: string) {
  const next = [kind, ...loadRecent().filter((k) => k !== kind)].slice(0, 4)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: no recent list, nothing else changes.
  }
}

export function ElementBadge({ spec, size = 'md' }: { spec: ElementSpec; size?: 'sm' | 'md' }) {
  const Icon = iconComponent(spec.icon)
  return (
    <span
      className={clsx('grid shrink-0 place-items-center rounded-full text-white', size === 'sm' ? 'h-6 w-6' : 'h-9 w-9')}
      style={{ background: spec.color === '#ffffff' ? '#1b1712' : spec.color }}
      aria-hidden
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
    </span>
  )
}

const PICKER_LAYERS = ELEMENT_LAYERS.filter((l) => l.elements.some((e) => e.pickable))

/** The element library: a design layer, then the element to draw. */
export function ElementPicker({ onPick, onClose }: { onPick: (spec: ElementSpec) => void; onClose: () => void }) {
  const [recent] = useState(loadRecent)
  const [layer, setLayer] = useState(() => elementFor(recent[0])?.layer ?? PICKER_LAYERS[0].layer)
  const current = PICKER_LAYERS.find((l) => l.layer === layer) ?? PICKER_LAYERS[0]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pointer-events-auto max-h-[70dvh] overflow-y-auto rounded-xl bg-white p-3 shadow-xl ring-1 ring-loam-200" role="dialog" aria-label={t('drawing.toolbar.choose')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-loam-900">{t('drawing.toolbar.choose')}</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {recent.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-loam-400">{t('drawing.toolbar.recent')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {recent.map((kind) => {
              const spec = elementFor(kind)!
              return (
                <button key={kind} type="button" onClick={() => onPick(spec)}
                  className="flex items-center gap-1.5 rounded-full bg-loam-50 py-1 pl-1 pr-2.5 text-sm text-loam-800 ring-1 ring-loam-200 hover:bg-loam-100">
                  <ElementBadge spec={spec} size="sm" />
                  {t(`editor.kinds.${kind}`)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" role="tablist">
        {PICKER_LAYERS.map((l) => (
          <button
            key={l.layer}
            type="button"
            role="tab"
            aria-selected={l.layer === layer}
            onClick={() => setLayer(l.layer)}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm',
              l.layer === layer ? 'bg-prune-600 text-white' : 'bg-loam-50 text-loam-700 hover:bg-loam-100',
            )}
          >
            <span className="h-2 w-2 rounded-full ring-1 ring-white/60" style={{ background: l.color }} />
            {t(`editor.layers.${l.layer}`)}
          </button>
        ))}
      </div>

      <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="tabpanel">
        {current.elements.filter((e) => e.pickable).map((spec) => (
          <li key={spec.kind}>
            <button
              type="button"
              onClick={() => onPick(spec)}
              className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-loam-50 focus-visible:outline-2 focus-visible:outline-prune-600"
            >
              <ElementBadge spec={spec} />
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm leading-tight text-loam-900">{t(`editor.kinds.${spec.kind}`)}</span>
                <span className="block text-xs text-loam-400">{t(`drawing.geometry_short.${spec.geometries[0]}`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {current.layer === 'networks' && <p className="mt-2 text-xs text-loam-500">{t('drawing.layers_panel.sensitive')}</p>}
    </div>
  )
}
