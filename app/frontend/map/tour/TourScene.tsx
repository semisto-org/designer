import { useEffect, useRef } from 'react'
import { Painter, readPalette, type Labels, type Particle } from '@/components/site/timelapse/draw.ts'
import { WORLD_H, WORLD_W, lerp, type SceneState } from '@/components/site/timelapse/model.ts'
import { loadPaint } from '@/components/site/timelapse/paint.ts'
import atlas from '@/components/site/timelapse/paint/atlas.webp'
import bed from '@/components/site/timelapse/paint/bed.webp'
import house from '@/components/site/timelapse/paint/house.webp'
import meadow from '@/components/site/timelapse/paint/meadow.webp'
import small from '@/components/site/timelapse/paint/small.webp'
import { content } from '@/lib/content'

/** On a phone the carnet takes the lower half: the terrain sits higher than on the home page. */
export const PHONE_SCENE = { top: 64, share: 0.42 }
function phoneCamera(vw: number, vh: number) {
  const sceneH = vh * PHONE_SCENE.share
  const k = Math.max(0.3, Math.min((vw - 8) / WORLD_W, sceneH / WORLD_H))
  return { k, ox: vw / 2 - (WORLD_W / 2) * k, oy: PHONE_SCENE.top + sceneH / 2 - (WORLD_H / 2) * k }
}

/** What a page of the carnet shows: a time on the example terrain, with or without the notes and the plan. */
export type TourMoment = { tau: number; observe?: boolean; plan?: boolean }

/**
 * The painted terrain of the home page, behind the carnet: each page sets a
 * moment, and time runs towards it, so turning from « Concevoir » to
 * « Planter » makes five years pass.
 */
export function TourScene({ moment, onTime }: { moment: TourMoment; onTime?: (tau: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const target = useRef(moment)
  target.current = moment
  const report = useRef(onTime)
  report.current = onTime

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const painter = new Painter(ctx, readPalette(document.documentElement), content<Labels>('site.home.story.canvas'), reduce)
    let alive = true
    loadPaint({ atlas, small, meadow, house, bed }).then((paint) => alive && painter.setPaint(paint), () => {})
    const particles: Particle[] = []
    const goal = (): SceneState => ({
      tau: target.current.tau, zoom: 1, observe: target.current.observe ? 1 : 0, plan: target.current.plan ? 1 : 0, plantMode: false, chapter: 1,
    })
    let shown = goal()
    let vw = 0
    let vh = 0
    let dpr = 1
    let wind = 0
    let last = performance.now()
    let frame = 0
    let reported = NaN

    const resize = () => {
      const box = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      vw = box.width
      vh = box.height
      canvas.width = Math.round(vw * dpr)
      canvas.height = Math.round(vh * dpr)
    }
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      wind += dt
      const to = goal()
      // Long jumps (thirty years) run a little slower, so the growth reads.
      const rate = Math.abs(to.tau - shown.tau) > 4 ? 0.05 : 0.01
      const ease = reduce ? 1 : 1 - Math.pow(rate, dt)
      shown = {
        ...to,
        tau: lerp(shown.tau, to.tau, ease),
        observe: lerp(shown.observe, to.observe, ease),
        plan: lerp(shown.plan, to.plan, ease),
      }
      const cam = vw > 760 ? painter.camera(vw, vh, 1) : phoneCamera(vw, vh)
      const season = painter.draw(shown, cam, vw, vh, dpr, wind, [], particles)
      painter.step(particles, season, shown.tau, dt)
      const month = Math.floor(shown.tau * 12)
      if (month !== reported) {
        reported = month
        report.current?.(shown.tau)
      }
      frame = requestAnimationFrame(loop)
    }

    resize()
    window.addEventListener('resize', resize)
    frame = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
}
