import * as Sentry from '@sentry/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { track } from '@/lib/analytics'
import { sentryEnabled } from '@/lib/sentry'
import { useEditor } from '@/map/editor/EditorContext'
import { isPlant } from '@/map/plants/properties'
import { busySeconds, openingSpeed, plausibleProps, staysBusy, type Device, type OpeningMeasure } from '@/map/performance/opening'

const IDLE_WATCH_MS = 10_000
const GIVE_UP_MS = 60_000

// Long tasks are collected from the page's start (buffered), where the
// browser supports it (Chromium): Safari and Firefox report null.
const longTasks: PerformanceEntry[] = []
let longTasksSupported = false
try {
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver((list) => longTasks.push(...list.getEntries())).observe({ type: 'longtask', buffered: true })
    longTasksSupported = true
  }
} catch {
  // Measuring never breaks the page.
}

function longTasksBetween(from: number, to: number): number | null {
  if (!longTasksSupported) return null
  return Math.round(longTasks.filter((e) => e.startTime >= from && e.startTime < to).reduce((sum, e) => sum + e.duration, 0))
}

function device(map: MapLibreMap): Device {
  let gpu: string | null = null
  try {
    const gl = map.getCanvas().getContext('webgl2') as WebGL2RenderingContext | null
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    gpu = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null
  } catch {
    gpu = null
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  return { cores: nav.hardwareConcurrency || null, memoryGb: nav.deviceMemory ?? null, pixelRatio: window.devicePixelRatio || 1, gpu }
}

/**
 * Measures, once per editor opening, how long the map took to be drawn and
 * whether it then went quiet; sends a coarse Plausible event every time and
 * a Sentry warning (with the machine) when it was slow or stayed busy.
 */
export default function MapOpeningProbe() {
  const editor = useEditor()
  const latest = useRef(editor)
  latest.current = editor
  const map = editor.instance

  useEffect(() => {
    const start = performance.now()
    let done = false
    let idleAt: number | null = null
    const renders: number[] = []
    let touched = false
    const timers: number[] = []
    const onRender = () => { if (idleAt != null) renders.push(performance.now()) }
    // Anywhere on the page: a panel or a card opening also moves the map.
    const onTouch = () => { if (idleAt != null) touched = true }
    const inputs = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const

    const report = (toIdleMs: number, until: number, watched: boolean) => {
      if (done) return
      done = true
      const features = latest.current.features
      const measure: OpeningMeasure = {
        toIdleMs: Math.round(toIdleMs),
        longTasksMs: longTasksBetween(start, until),
        idleRedraws: watched && !touched ? renders.length : null,
        idleBusySeconds: watched && !touched ? busySeconds(renders, until, IDLE_WATCH_MS / 1000) : null,
        pageAgeMs: Math.round(start),
        features: features.length,
        plants: features.filter(isPlant).length,
      }
      const machine = device(map)
      track('map_open', plausibleProps(measure, machine))
      const slow = openingSpeed(measure) === 'slow'
      const busy = staysBusy(measure)
      if (sentryEnabled && (slow || busy)) {
        Sentry.captureMessage(busy ? 'Map keeps redrawing while idle' : 'Slow map opening', {
          level: 'warning',
          fingerprint: [busy ? 'map-busy-while-idle' : 'slow-map-opening'],
          tags: { map_speed: openingSpeed(measure), map_busy: busy ? 'yes' : 'no', cores: String(machine.cores ?? 'unknown') },
          contexts: { map_opening: { ...measure }, device_hints: { ...machine } },
        })
      }
    }

    const onIdle = () => {
      const at = performance.now()
      idleAt = at
      map.on('render', onRender)
      timers.push(window.setTimeout(() => report(at - start, at, true), IDLE_WATCH_MS))
    }

    try {
      inputs.forEach((name) => document.addEventListener(name, onTouch, { passive: true, capture: true }))
      map.once('idle', onIdle)
      // A tile server that never answers keeps `idle` away: report what we have.
      timers.push(window.setTimeout(() => report(GIVE_UP_MS, performance.now(), false), GIVE_UP_MS))
    } catch {
      // Measuring never breaks the page.
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      map.off('idle', onIdle)
      map.off('render', onRender)
      inputs.forEach((name) => document.removeEventListener(name, onTouch, { capture: true }))
    }
  }, [map])

  return null
}
