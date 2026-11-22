import clsx from 'clsx'
import { Image, PencilLine } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { PHOTO_MAX } from './rules'
import { setDrawnViewEnabled, setDrawnViewPhoto, useDrawnViewChoice } from './store'

/**
 * Beside « Existant | Projet », only in « Projet »: the drawn view on or
 * off and, in a small pop-over, how much of the aerial photo shows through
 * the paper. Two icons, so the header keeps its room for the map's name.
 */
export function DrawnViewControl({ className, popoverUp = false }: { className?: string; popoverUp?: boolean }) {
  const { mode } = useEditor()
  const enabled = useDrawnViewChoice((s) => s.enabled)
  const photo = useDrawnViewChoice((s) => s.photo)
  const [open, setOpen] = useState(false)
  const sliderId = useId()
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  // The pop-over is laid on the page itself, above every card of the map's
  // foot (the margin, the legend), right under or over the button.
  const [place, setPlace] = useState<{ right: number; top?: number; bottom?: number } | null>(null)
  useLayoutEffect(() => {
    const anchor = box.current
    if (!open || !anchor) return setPlace(null)
    const measure = () => {
      const rect = anchor.getBoundingClientRect()
      if (rect.width === 0) return setOpen(false) // the strip folded the button away
      const right = Math.max(8, window.innerWidth - rect.right)
      setPlace(popoverUp ? { right, bottom: window.innerHeight - rect.top + 8 } : { right, top: rect.bottom + 8 })
    }
    measure()
    // A rotated phone, a strip that grows or shrinks: the pop-over follows its button.
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(document.body)
    observer?.observe(anchor)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [open, popoverUp])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      const target = event.target as Node
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(target) && !pop.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (mode !== 'project') return null
  return (
    <div ref={box} className={clsx('relative flex items-center gap-0.5 rounded-full bg-loam-50 p-0.5 ring-1 ring-loam-200', className)}>
      <IconButton
        size="sm"
        pressed={enabled}
        label={enabled ? t('drawn_view.turn_off') : t('drawn_view.turn_on')}
        onClick={() => { if (enabled) setOpen(false); setDrawnViewEnabled(!enabled) }}
      >
        <PencilLine aria-hidden />
      </IconButton>
      {enabled && (
        <IconButton size="sm" pressed={open} label={t('drawn_view.photo_hint')} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Image aria-hidden />
        </IconButton>
      )}
      {enabled && open && place && createPortal(
        <div ref={pop} style={place} className="fixed z-50 w-64 max-w-[calc(100vw-16px)] rounded-2xl bg-white p-3 shadow-lg ring-1 ring-loam-900/10">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={sliderId} className="text-sm font-medium text-loam-800">{t('drawn_view.photo')}</label>
            <span className="text-sm tabular-nums text-loam-600">{Math.round(photo * 100)} %</span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={PHOTO_MAX}
            step={0.05}
            value={photo}
            aria-valuetext={t('drawn_view.photo_value', { percent: Math.round(photo * 100) })}
            onChange={(event) => setDrawnViewPhoto(Number(event.target.value))}
            className="mt-1 w-full accent-prune-600"
          />
          <p className="mt-1 text-sm leading-snug text-loam-600">{t('drawn_view.photo_help')}</p>
        </div>,
        document.body,
      )}
    </div>
  )
}
