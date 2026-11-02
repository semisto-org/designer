import { ArrowRight, BookOpen, Droplets, Loader2, MapPin, Mountain, Sun } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { HandNote } from '@/components/ui/HandNote'
import { api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { openTour } from '@/map/tour/TourOverlay'
import { readingLines, type ReadingLine } from '@/trials/reading'
import { readingSentence } from '@/trials/sentence'
import type { LngLat } from '@/types'
import type { TrialReading } from '@/types/trials'

const OPEN_EVENT = 'designer:first-hour-open'

/** « Relire mon lieu » (Parcours panel) opens it again. */
export function openFirstHour() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

type State = { status: 'loading' } | { status: 'done'; reading: TrialReading; relief: boolean } | { status: 'error' }

/** The tool that says more about a line of the reading. */
const LINE_PANEL: Partial<Record<ReadingLine['key'], { panel: string; label: string; icon: typeof Mountain }>> = {
  slope: { panel: 'relief', label: 'place_reading.open.relief', icon: Mountain },
  gentle: { panel: 'relief', label: 'place_reading.open.relief', icon: Mountain },
  flat: { panel: 'relief', label: 'place_reading.open.relief', icon: Mountain },
  water_side: { panel: 'relief', label: 'place_reading.open.water', icon: Droplets },
  water_low: { panel: 'relief', label: 'place_reading.open.water', icon: Droplets },
  sun: { panel: 'sun', label: 'place_reading.open.sun', icon: Sun },
}

/**
 * « Voici ton lieu », the first page of « Ta première heure »: once a new
 * map's terrain is outlined (and the « Terrain » panel left), what Terranova
 * reads of the place on its own (slope, where rain water goes, the sun its
 * slope faces, the room there is), each line opening the tool that says
 * more, then what no map knows and the person will go and see outside.
 * Opens by itself once per map, for its owner; read, it is remembered on
 * the map (`firstHourStartedAt`) and opens again from the Parcours panel.
 */
export default function FirstHourOverlay() {
  const editor = useEditor()
  const { map } = editor
  const outlined = map.boundary != null
  const pending = editor.canEdit && !map.firstHourStartedAt
  // Its owner is greeted by their place; someone invited, by « Bienvenue » (WelcomeCard).
  const greets = pending && map.role === 'owner'
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ status: 'loading' })
  const marker = useRef<maplibregl.Marker | null>(null)
  const auto = useRef(false)

  // On a new map, once the outline is there and the person left « Terrain ».
  const outlining = editor.activePanel === 'terrain'
  useEffect(() => {
    if (!greets || !outlined || outlining || auto.current) return
    auto.current = true
    setOpen(true)
    track('first_hour_open', { from: 'outline' })
  }, [greets, outlined, outlining])

  useEffect(() => {
    const onOpen = () => { setOpen(true); track('first_hour_open', { from: 'journey' }) }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Read when opened, again if the outline changed since.
  const boundaryKey = JSON.stringify(map.boundary?.coordinates?.[0]?.[0]?.slice(0, 3) ?? null)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    api<{ reading: TrialReading; relief: boolean }>(`/maps/${map.id}/place_reading`, { signal: controller.signal })
      .then((data) => setState({ status: 'done', reading: data.reading, relief: data.relief }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) })
    return () => controller.abort()
  }, [open, map.id, boundaryKey])

  useEffect(() => () => { marker.current?.remove() }, [])

  const close = useCallback(() => {
    setOpen(false)
    if (!pending) return
    // Remembered on the map, for every device; not remembered (offline…), it
    // simply opens again on the next visit.
    api<{ firstHourStartedAt: string }>(`/maps/${map.id}/place_reading`, { method: 'PATCH' })
      .then((data) => editor.setMap({ ...editor.map, firstHourStartedAt: data.firstHourStartedAt }))
      .catch(() => {})
  }, [pending, map.id, editor])

  const openPanel = (panel: string) => {
    close()
    editor.openPanel(panel)
  }

  const showLowPoint = (at: LngLat) => {
    close()
    marker.current?.remove()
    const el = document.createElement('div')
    el.className = 'rounded-full bg-white px-2 py-1 text-sm font-semibold text-prune-700 shadow ring-1 ring-prune-200'
    el.textContent = t('trials.show.low_point')
    marker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(at).addTo(editor.instance)
    editor.instance.flyTo({ center: at, zoom: Math.max(editor.instance.getZoom(), 18) })
  }

  const lines = state.status === 'done' ? readingLines(state.reading, map.areaM2) : []
  const lowPoint = state.status === 'done' ? state.reading.low_point ?? null : null
  const noSlope = state.status === 'error' || (state.status === 'done' && state.reading.slope_pct == null)

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('place_reading.title', { name: map.name })}
      footer={
        <>
          <Button variant="ghost" onClick={() => { close(); openTour() }}>
            <BookOpen className="h-4 w-4" aria-hidden />{t('place_reading.tour')}
          </Button>
          <Button onClick={close}>{t('place_reading.start')}<ArrowRight className="h-4 w-4" aria-hidden /></Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-loam-600">{t('place_reading.intro')}</p>
        {state.status === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-loam-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('trials.reading.loading')}
          </p>
        )}
        {state.status !== 'loading' && (
          <ul className="space-y-3">
            {lines.map((line, i) => {
              const link = LINE_PANEL[line.key]
              return (
                <li key={line.key} className="space-y-1">
                  <p className={i === 0 ? 'font-hand text-2xl leading-snug text-loam-900' : 'text-base text-loam-800'}>{readingSentence(line)}</p>
                  <div className="flex flex-wrap gap-1">
                    {link && (
                      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => openPanel(link.panel)}>
                        <link.icon className="h-4 w-4" aria-hidden />{t(link.label)}
                      </Button>
                    )}
                    {(line.key === 'water_side' || line.key === 'water_low') && lowPoint && (
                      <Button variant="ghost" size="sm" className={link ? undefined : '-ml-3'} onClick={() => showLowPoint(lowPoint)}>
                        <MapPin className="h-4 w-4" aria-hidden />{t('place_reading.low_point')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
            {state.status === 'done' && !state.relief && <li className="text-sm text-loam-500">{t('trials.reading.no_relief')}</li>}
            {noSlope && (state.status === 'error' || state.relief) && (
              <li className="text-sm text-loam-500">{t('trials.reading.unavailable')}</li>
            )}
          </ul>
        )}
        <section className="rounded-2xl bg-leaf-50 p-4 ring-1 ring-leaf-200">
          <h3 className="font-sans text-base font-semibold text-leaf-800">{t('place_reading.outside.title')}</h3>
          <p className="mt-1 text-loam-700">{t('place_reading.outside.body')}</p>
          <HandNote tone="leaf" className="mt-2">{t('place_reading.outside.note')}</HandNote>
        </section>
      </div>
    </Dialog>
  )
}
