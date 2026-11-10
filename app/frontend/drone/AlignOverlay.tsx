import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { Crosshair, Eye, EyeOff, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { alignStore, completePairs, nextStep, useAlign, type DraftPair } from '@/drone/align'
import { applySimilarity, invertSimilarity, lngLat, mercator, metersBetween, similarity, type LngLat } from '@/drone/alignment'
import { aerialViewLabel } from '@/drone/format'
import { aerialLayerId } from '@/drone/placement'
import { installPreview, movePreview, setPreviewLinks, setPreviewOpacity } from '@/drone/shifted'
import { aerialStore, useAerialState } from '@/drone/store'
import { layerStore } from '@/map/data/store'
import { useEditor } from '@/map/editor/EditorContext'
import { t } from '@/lib/i18n'
import type { AerialView } from '@/types/drone'

const SEE_THROUGH = 0.5

/**
 * « Recaler la vue », on the map: a click on a sharp point of the drone
 * view, then a click where it really is, and the view follows (a live
 * preview drawn from its own tiles, drone/shifted). Two or three landmarks
 * also turn it. « Recaler la vue » sends them; the server cuts the tiles
 * again where they belong, and the old ones stay meanwhile.
 */
export default function AlignOverlay({ views }: { views: AerialView[] }) {
  const align = useAlign()
  const view = views.find((v) => v.id === align.viewId) ?? null
  useEffect(() => {
    if (align.viewId != null && !view) alignStore.cancel()
  }, [align.viewId, view])
  return view ? <Aligning view={view} /> : null
}

function Aligning({ view }: { view: AerialView }) {
  const { instance, map } = useEditor()
  const align = useAlign()
  const aerial = useAerialState()
  const pairs = completePairs(align.pairs)
  const moving = useMemo(() => similarity(pairs), [JSON.stringify(pairs)]) // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef({ moving, pairs: align.pairs })
  latest.current = { moving, pairs: align.pairs }
  const step = nextStep(align.pairs)

  // The view being realigned is the one shown, clicks are ours, Escape leaves.
  useEffect(() => {
    aerialStore.select(view.id)
    layerStore.claimClicks('aerial-align')
    instance.getCanvas().style.cursor = 'crosshair'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') alignStore.cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      layerStore.releaseClicks('aerial-align')
      instance.getCanvas().style.cursor = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [instance, view.id])

  // The preview stands where the view is, hidden meanwhile (layers.ts).
  useEffect(
    () => installPreview(instance, view, aerialLayerId(view.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instance, view.id, view.url, view.minZoom, view.maxZoom],
  )

  // Each landmark placed moves the preview.
  useEffect(() => movePreview(instance, view, moving), [instance, view, moving])

  useEffect(() => {
    setPreviewOpacity(instance, align.seeThrough ? Math.min(SEE_THROUGH, aerial.opacity) : aerial.opacity)
  }, [instance, align.seeThrough, aerial.opacity])

  // A click places the next point: on the drone view as it is shown now
  // (brought back to the unmoved view), then where it really is.
  useEffect(() => {
    const onClick = (event: MapMouseEvent) => {
      const point: LngLat = [event.lngLat.lng, event.lngLat.lat]
      const { moving: current, pairs: draft } = latest.current
      if (nextStep(draft) === 'from') alignStore.place(lngLat(applySimilarity(invertSimilarity(current), mercator(point))))
      else alignStore.place(point)
    }
    instance.on('click', onClick)
    return () => {
      instance.off('click', onClick)
    }
  }, [instance])

  useMarkers(align.pairs, moving)

  const shift = pairs.length > 0 ? metersBetween(pairs[0].from, pairs[0].to) : null
  const instruction = step === 'to'
    ? t('drone.align.pick_to')
    : pairs.length === 0
      ? t('drone.align.pick_from')
      : t(pairs.length === 1 ? 'drone.align.ready_one' : 'drone.align.ready_many', { count: pairs.length })

  return (
    // On a phone the bar sits low, above the tool bar, so the map stays free where the thumb taps.
    <div className="pointer-events-none absolute inset-x-2 bottom-24 z-20 flex justify-center md:bottom-auto md:top-[4.5rem]">
      <section
        aria-label={t('drone.align.title', { name: aerialViewLabel(view) })}
        className="pointer-events-auto w-full max-w-xl rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-prune-200"
      >
        <div className="flex items-start gap-2">
          <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-prune-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-loam-900">{t('drone.align.title', { name: aerialViewLabel(view) })}</p>
            <p className="mt-0.5 text-sm text-loam-700" role="status">{instruction}</p>
            {shift != null && pairs.length === 1 && (
              <p className="mt-0.5 text-sm text-loam-500">{t('drone.align.shift', { meters: shift.toLocaleString('fr-BE', { maximumFractionDigits: 1 }) })}</p>
            )}
            {align.pairs.length === 0 && <p className="mt-1 text-sm text-loam-500">{t('drone.align.outdoor_tip')}</p>}
            {align.error && <p className="mt-1 text-sm text-clay-700" role="alert">{align.error}</p>}
          </div>
          <IconButton label={t(align.seeThrough ? 'drone.align.see_view' : 'drone.align.see_through')} pressed={align.seeThrough} onClick={() => alignStore.toggleSeeThrough()} size="sm">
            {align.seeThrough ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </IconButton>
          {align.pairs.length > 0 && (
            <IconButton label={t('drone.align.remove_last')} onClick={() => alignStore.removeLast()} size="sm">
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => alignStore.cancel()}>{t('drone.align.cancel')}</Button>
          <Button size="sm" disabled={pairs.length === 0 || align.saving} onClick={() => void alignStore.submit(map.id)}>
            {align.saving ? t('drone.align.saving') : t('drone.align.submit')}
          </Button>
        </div>
      </section>
    </div>
  )
}

/**
 * The landmarks on the map: each pair's real place (a numbered pin, to drag
 * for a finer fit), where its point was on the unmoved view (a small ring),
 * and a dashed line between them; a pair waiting for its real place shows
 * its numbered ring where it was clicked.
 */
function useMarkers(pairs: DraftPair[], moving: ReturnType<typeof similarity>) {
  const { instance } = useEditor()
  const markers = useRef<maplibregl.Marker[]>([])

  useEffect(() => {
    markers.current.forEach((marker) => marker.remove())
    markers.current = []
    const links: [LngLat, LngLat][] = []
    pairs.forEach((pair, index) => {
      const number = String(index + 1)
      if (pair.to) {
        links.push([pair.from, pair.to])
        markers.current.push(new maplibregl.Marker({ element: ring('', t('drone.align.marker_from', { n: number })) }).setLngLat(pair.from).addTo(instance))
        const pin = new maplibregl.Marker({ element: dot(number, t('drone.align.marker_to', { n: number })), draggable: true }).setLngLat(pair.to).addTo(instance)
        pin.on('dragend', () => {
          const { lng, lat } = pin.getLngLat()
          alignStore.move(index, 'to', [lng, lat])
        })
        markers.current.push(pin)
      } else {
        const shown = lngLat(applySimilarity(moving, mercator(pair.from)))
        markers.current.push(new maplibregl.Marker({ element: ring(number, t('drone.align.marker_from', { n: number })) }).setLngLat(shown).addTo(instance))
      }
    })
    setPreviewLinks(instance, links)
    return () => {
      markers.current.forEach((marker) => marker.remove())
      markers.current = []
    }
  }, [instance, pairs, moving])
}

function dot(label: string, title: string): HTMLElement {
  const element = document.createElement('div')
  element.className = 'flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-prune-600 text-sm font-semibold text-white shadow ring-2 ring-white'
  element.textContent = label
  element.title = title
  element.setAttribute('aria-label', title)
  return element
}

function ring(label: string, title: string): HTMLElement {
  const element = document.createElement('div')
  element.className = label
    ? 'flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-prune-700 shadow ring-2 ring-prune-600'
    : 'h-3 w-3 rounded-full bg-white/80 ring-2 ring-prune-600'
  element.textContent = label
  element.title = title
  element.setAttribute('aria-label', title)
  return element
}
