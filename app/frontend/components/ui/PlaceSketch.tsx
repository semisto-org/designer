import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { formatArea, t } from '@/lib/i18n'
import { drawSketch } from '@/my_maps/sketch'
import type { SketchGeometry } from '@/types/myMaps'

/**
 * The place itself, small: its real outline washed in watercolour and drawn
 * in pencil, north up, with its area. For any screen, card or e-mail preview
 * that speaks about a map, so it always shows *this* place.
 */
export function PlaceSketch({ id, name, boundary, areaM2, className }: {
  id: number
  name: string
  boundary: SketchGeometry | null
  areaM2?: number | null
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const paint = () => drawSketch(el, { id, boundary, areaLabel: formatArea(areaM2) }, 1, {
      noOutline: t('my_maps.sketch.no_outline'),
      noOutlineHint: t('my_maps.sketch.no_outline_hint'),
      growthLabel: null,
    })
    const observer = new ResizeObserver(paint)
    observer.observe(el)
    let live = true
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (live) paint() })
    return () => { live = false; observer.disconnect() }
  }, [id, boundary, areaM2])
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={t('my_maps.sketch.label', { name })}
      className={clsx('block aspect-[4/3] w-full rounded-2xl bg-loam-50 ring-1 ring-loam-900/10', className)}
    />
  )
}
