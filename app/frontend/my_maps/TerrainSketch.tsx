import { useEffect, useRef, useState } from 'react'
import { formatArea, t } from '@/lib/i18n'
import type { ListedMap } from '@/types/teams'
import { drawSketch, type SketchCache } from './sketch'

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
  const cache = useRef<SketchCache>({})
  // A long list paints a sketch only when it comes near the screen.
  const [seen, setSeen] = useState(false)
  const hasPlants = (map.sketch?.plants.length ?? 0) > 0

  const paint = () => {
    if (!canvas.current) return
    const g = growth.current
    const year = Math.min(30, Math.round(1 + ((g - TODAY) / (ADULT - TODAY)) * 29))
    drawSketch(canvas.current, { id: map.id, boundary: map.boundary, areaLabel: formatArea(map.areaM2), sketch: map.sketch }, g, {
      noOutline: t('my_maps.sketch.no_outline'),
      noOutlineHint: t('my_maps.sketch.no_outline_hint'),
      growthLabel: hasPlants ? (g < TODAY + 0.02 ? t('my_maps.sketch.today') : t('my_maps.sketch.year', { year })) : null,
    }, cache.current)
  }

  useEffect(() => {
    const el = canvas.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') return setSeen(true)
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true)
    }, { rootMargin: '400px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [seen])

  // Paint on first sight, on resize (the observer's first call is the first
  // paint), and once more if the hand-writing font was still loading.
  useEffect(() => {
    const el = canvas.current
    if (!el || !seen) return
    cache.current = {}
    let size = ''
    const observer = new ResizeObserver(() => {
      const next = `${el.clientWidth}x${el.clientHeight}`
      if (next !== size) { size = next; paint() }
    })
    observer.observe(el)
    let live = true
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (live) paint() })
    return () => { live = false; observer.disconnect() }
  }, [map, seen])

  useEffect(() => {
    if (!hasPlants || !seen) return
    const target = grown ? ADULT : TODAY
    if (growth.current === target) return
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
  }, [grown, hasPlants, seen])

  return <canvas ref={canvas} role="img" aria-label={t('my_maps.sketch.label', { name: map.name })} className={className} />
}
