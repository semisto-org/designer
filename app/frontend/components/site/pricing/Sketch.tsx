import { useEffect, useRef } from 'react'
import type { SpriteKey } from '@/components/site/timelapse/paint'
import { drawSprite, loadAtlases } from '@/public_maps/gardenLayer'
import { lots } from './lots'

const TREES: SpriteKey[] = ['fruit', 'pommier_fruit', 'noisetier', 'noyer', 'chataignier', 'poirier_fruit', 'aulne', 'cerisier_fruit']
const SHRUBS: SpriteKey[] = ['cassis', 'sureau', 'groseillier', 'framboisier', 'argousier', 'rosier']

/** Draws on a canvas sized to its box, sharp on every screen, once the paintings are there. */
function usePainting(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, paint: Awaited<ReturnType<typeof loadAtlases>> | null) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let alive = true
    let atlases: Awaited<ReturnType<typeof loadAtlases>> | null = null
    const paint = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      draw(ctx, rect.width, rect.height, atlases)
    }
    paint()
    loadAtlases().then((loaded) => {
      if (!alive) return
      atlases = loaded
      paint()
    }, () => {})
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => paint())
    observer?.observe(canvas)
    return () => {
      alive = false
      observer?.disconnect()
    }
  }, deps)
  return ref
}

function token(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim() || fallback
}

/** As many little places as a plan holds, seen from the air, in pencil and watercolour. */
export function PlacesSketch({ count, className }: { count: number; className?: string }) {
  const ref = usePainting((ctx, w, h, atlases) => {
    const ink = token('prune-900', '#2b2940')
    const leaf = token('leaf-600', '#6d7a00')
    let n = 0
    for (const lot of lots(count, w, h)) {
      ctx.beginPath()
      lot.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.fillStyle = leaf
      ctx.globalAlpha = 0.08
      ctx.fill()
      ctx.globalAlpha = 0.8
      ctx.strokeStyle = ink
      ctx.lineWidth = count > 12 ? 1 : 1.5
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.globalAlpha = 1
      if (!atlases) continue
      for (const crown of lot.crowns) {
        n += 1
        const sprite: SpriteKey = crown.kind === 'pond' ? 'pond' : crown.kind === 'tree' ? TREES[n % TREES.length] : SHRUBS[n % SHRUBS.length]
        ctx.save()
        ctx.translate(crown.x, crown.y)
        ctx.rotate(((n * 47) % 360) * (Math.PI / 180))
        drawSprite(ctx, atlases, sprite, crown.r * 2.2)
        ctx.restore()
      }
    }
  }, [count])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}

/** One painted crown, as big as the tree is after `age` years (0 = a bare plot). */
export function GrowingCrown({ age, className }: { age: number; className?: string }) {
  const ref = usePainting((ctx, w, h, atlases) => {
    if (!atlases) return
    const share = Math.min(1, Math.sqrt(Math.max(age, 0.4) / 30))
    const ground = token('loam-300', '#cfc6b3')
    ctx.strokeStyle = ground
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(w / 2, h / 2, w * 0.46, h * 0.46, 0, 0, Math.PI * 2)
    ctx.setLineDash([2, 5])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.save()
    ctx.translate(w / 2, h / 2)
    if (age <= 0) {
      drawSprite(ctx, atlases, 'litter_2', w * 0.35)
    } else {
      // Ground covers and shrubs come first, the tree takes over with the years.
      if (age >= 2) drawSprite(ctx, atlases, 'fraisier', w * 0.5 * Math.min(1, age / 5))
      drawSprite(ctx, atlases, age < 3 ? 'cassis' : 'pommier_fruit', w * (0.22 + 0.72 * share))
    }
    ctx.restore()
  }, [age])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
