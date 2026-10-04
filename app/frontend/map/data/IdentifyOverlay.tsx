import { ExternalLink, X } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { onSingleClick } from '@/map/singleClick'
import { useLayerState, visibleOverlays } from '@/map/data/store'
import type { RegionLayerData } from '@/types'
import type { IdentifyLayerResult, IdentifyResponse } from '@/types/map_data'

// Feature layers of the editor: a click on one of them selects it, so the
// identify popup stays out of the way (AGENT_RULES "Map clicks").
const FEATURE_LAYERS = ['features-fill', 'features-line', 'features-point']
const MOBILE = '(max-width: 767px)'

type Query = {
  id: number
  lngLat: [number, number]
  layers: Pick<RegionLayerData, 'key' | 'name'>[]
  results: IdentifyLayerResult[] | null
  failed: boolean
  mobile: boolean
}

/**
 * "What is here?": a click on the map, outside any feature and any tool,
 * with at least one identifiable data layer shown, opens a popup (a bottom
 * sheet on phones) with what each layer says at that point. A double-click
 * zooms and opens nothing.
 */
export default function IdentifyOverlay() {
  const editor = useEditor()
  const { instance, map, regionLayers } = editor
  const state = useLayerState()
  const [query, setQuery] = useState<Query | null>(null)
  const latest = useRef({ state, drawing: editor.drawing })
  latest.current = { state, drawing: editor.drawing }
  const abort = useRef<AbortController | null>(null)
  const counter = useRef(0)

  const close = useCallback(() => {
    abort.current?.abort()
    setQuery(null)
  }, [])

  useEffect(() => {
    const onClick = (event: MapMouseEvent) => {
      const { state: current, drawing } = latest.current
      if (drawing || current.clickOwner) return
      const featureLayers = FEATURE_LAYERS.filter((id) => instance.getLayer(id))
      if (featureLayers.length && instance.queryRenderedFeatures(event.point, { layers: featureLayers }).length) {
        close()
        return
      }
      const shown = visibleOverlays(current)
      const layers = regionLayers.filter((l) => l.category === 'overlay' && l.identifiable && shown.includes(l.key))
      if (layers.length === 0) {
        close()
        return
      }

      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      const id = ++counter.current
      const { lng, lat } = event.lngLat
      setQuery({
        id, lngLat: [lng, lat], layers: layers.map(({ key, name }) => ({ key, name })),
        results: null, failed: false, mobile: window.matchMedia(MOBILE).matches,
      })
      const params = new URLSearchParams({ lng: lng.toFixed(7), lat: lat.toFixed(7), zoom: instance.getZoom().toFixed(2) })
      layers.forEach((l) => params.append('layers[]', l.key))
      api<IdentifyResponse>(`/maps/${map.id}/identify?${params}`, { signal: controller.signal })
        .then((data) => setQuery((q) => (q?.id === id ? { ...q, results: data.results } : q)))
        .catch((error: Error) => {
          if (error.name === 'AbortError') return
          setQuery((q) => (q?.id === id ? { ...q, failed: true } : q))
        })
    }
    // A double-click only zooms: it must not open the popup too.
    return onSingleClick(instance, onClick)
  }, [instance, map.id, regionLayers, close])

  useEffect(() => {
    if (!query) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [query, close])

  // A tool taking the clicks, or drawing, closes the popup.
  useEffect(() => {
    if (editor.drawing || state.clickOwner) close()
  }, [editor.drawing, state.clickOwner, close])

  useEffect(() => () => abort.current?.abort(), [])

  if (!query) return null
  const card = <IdentifyCard query={query} onClose={close} />
  return query.mobile ? <MobileSheet query={query}>{card}</MobileSheet> : <DesktopPopup query={query}>{card}</DesktopPopup>
}

function DesktopPopup({ query, children }: { query: Query; children: ReactNode }) {
  const { instance } = useEditor()
  const [container] = useState(() => document.createElement('div'))

  useEffect(() => {
    const p = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '320px', offset: 8, className: 'designer-identify' })
      .setDOMContent(container)
      .setLngLat(query.lngLat)
      .addTo(instance)
    const content = p.getElement()?.querySelector<HTMLElement>('.maplibregl-popup-content')
    if (content) Object.assign(content.style, { padding: '0', borderRadius: '0.75rem', overflow: 'hidden' })
    return () => {
      p.remove()
    }
  }, [instance, container, query.id, query.lngLat])


  return createPortal(children, container)
}

function MobileSheet({ query, children }: { query: Query; children: ReactNode }) {
  const { instance } = useEditor()
  useEffect(() => {
    const dot = document.createElement('div')
    dot.className = 'h-3.5 w-3.5 rounded-full border-2 border-white bg-prune-600 shadow'
    const marker = new maplibregl.Marker({ element: dot }).setLngLat(query.lngLat).addTo(instance)
    return () => {
      marker.remove()
    }
  }, [instance, query.lngLat])
  return (
    <div className="absolute inset-x-2 bottom-14 z-30 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-loam-200">
      {children}
    </div>
  )
}

function IdentifyCard({ query, onClose }: { query: Query; onClose: () => void }) {
  const byKey = new Map((query.results ?? []).map((r) => [r.key, r]))
  return (
    <div className="w-full text-loam-800 md:w-72" role="dialog" aria-labelledby={`identify-title-${query.id}`}>
      <div className="flex items-center justify-between gap-2 border-b border-loam-100 px-3 py-2">
        <h3 id={`identify-title-${query.id}`} className="text-sm font-semibold text-loam-900">{t('map_data.identify.title')}</h3>
        <button type="button" onClick={onClose} aria-label={t('map_data.identify.close')} className="rounded-md p-1 text-loam-500 hover:bg-loam-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[40vh] space-y-3 overflow-y-auto px-3 py-2.5 md:max-h-80" aria-live="polite" aria-busy={!query.results && !query.failed}>
        {query.layers.map((layer) => (
          <section key={layer.key}>
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-wide text-loam-500">{layer.name}</h4>
            <LayerAnswer result={byKey.get(layer.key)} loading={!query.results && !query.failed} />
          </section>
        ))}
      </div>
    </div>
  )
}

function LayerAnswer({ result, loading }: { result: IdentifyLayerResult | undefined; loading: boolean }) {
  if (loading) return <p className="mt-0.5 text-sm text-loam-400">{t('map_data.identify.loading')}</p>
  if (!result || result.status === 'unavailable') {
    return <p className="mt-0.5 text-sm text-humus-700">{t('map_data.identify.unavailable')}</p>
  }
  if (result.status === 'empty' || result.entries.length === 0) {
    return <p className="mt-0.5 text-sm text-loam-400">{t('map_data.identify.empty')}</p>
  }
  return (
    <ul className="mt-1 space-y-1.5">
      {result.entries.map((entry, index) => (
        <li key={index} className="text-sm leading-snug">
          {/* Third-party values: rendered as text, never as HTML. */}
          <div className="text-loam-800">{entry.text}</div>
          {entry.detail && <div className="text-xs text-loam-500">{entry.detail}</div>}
          {entry.href?.startsWith('https://') && (
            <a href={entry.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-prune-600 underline hover:text-prune-700">
              {entry.hrefLabel || t('map_data.identify.more')}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
