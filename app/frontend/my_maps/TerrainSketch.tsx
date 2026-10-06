import { useEffect, useRef } from 'react'
import { formatArea, t } from '@/lib/i18n'
import type { ListedMap } from '@/types/teams'
import { drawSketch } from './sketch'

/** Plants are drawn young until the card is hovered, then grow to year 30. */
const TODAY = 0.3
const ADULT = 1

/**
 * The terrain painted as a notebook sketch. `grown` (hover or focus on the
 * card) lets thirty years go by on a map that has plants.
 */
export function TerrainSketch({ map, grown = false, className }: { map: ListedMap; grown?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const growth = useRef(TODAY)
  const hasPlants = (map.sketch?.plants.length ?? 0) > 0

  const paint = () => {
    if (!canvas.current) return
    const g = growth.current
    const year = Math.min(30, Math.round(1 + ((g - TODAY) / (ADULT - TODAY)) * 29))
    drawSketch(canvas.current, { id: map.id, boundary: map.boundary, areaLabel: formatArea(map.areaM2), sketch: map.sketch }, g, {
      noOutline: t('my_maps.sketch.no_outline'),
      noOutlineHint: t('my_maps.sketch.no_outline_hint'),
      growthLabel: hasPlants ? (g < TODAY + 0.02 ? t('my_maps.sketch.today') : t('my_maps.sketch.year', { year })) : null,
    })
  }

  // Repaint on resize and once the hand-writing font is there.
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    paint()
    document.fonts?.ready.then(paint)
    const observer = new ResizeObserver(() => paint())
    observer.observe(el)
    return () => observer.disconnect()
  }, [map])

  useEffect(() => {
    if (!hasPlants) return
    const target = grown ? ADULT : TODAY
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const step = () => {
      const g = growth.current
      growth.current = reduce || Math.abs(target - g) < 0.003 ? target : g + (target - g) * 0.06
      paint()
      if (growth.current !== target) frame = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(frame)
  }, [grown, hasPlants])

  return <canvas ref={canvas} role="img" aria-label={t('my_maps.sketch.label', { name: map.name })} className={className} />
}
