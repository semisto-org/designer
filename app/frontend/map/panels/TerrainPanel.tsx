import { area as turfArea } from '@turf/turf'
import { FileUp, Grid2x2Check, Loader2, PenLine, X } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { MultiPolygon, Polygon } from 'geojson'
import { Button, buttonClass } from '@/components/ui/Button'
import { ApiError, api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { AddressSearch } from '@/map/data/AddressSearch'
import { layerStore } from '@/map/data/store'
import { useEditor } from '@/map/editor/EditorContext'
import { hideParcelSelection, showParcelSelection } from '@/map/layers/parcels'
import type { MapData, RegionLayerData } from '@/types'
import type { GeocodeResult, ParcelData } from '@/types/map_data'

const FEATURE_LAYERS = ['features-fill', 'features-line', 'features-point']
const IMPORT_ACCEPT = '.geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml'
type StartStep = 'parcels' | 'draw' | 'import'

// "/maps/1?terrain=parcels" (set by the new-map form) starts a step once.
const startedSteps = new Set<number>()
function consumeStartStep(mapId: number): StartStep | null {
  if (startedSteps.has(mapId)) return null
  startedSteps.add(mapId)
  const step = new URLSearchParams(window.location.search).get('terrain')
  return step === 'parcels' || step === 'draw' || step === 'import' ? step : null
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : t('map_data.terrain.error')
}

/**
 * The terrain: find it (address), outline it (cadastral parcels, drawing
 * or a GeoJSON/KML file). The outline frames everything else.
 */
export default function TerrainPanel() {
  const editor = useEditor()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const importButton = useRef<HTMLButtonElement>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  // The cadastre layer parcels are picked on: identified through ArcGIS, or
  // served by the region's own cadastre provider (`options.parcels`).
  const cadastre = editor.regionLayers.find((l) => l.options.role === 'cadastre' && (l.identifiable || l.options.parcels === true))

  function applyMap(map: MapData) {
    editor.setMap(map)
    if (map.bbox) editor.instance.fitBounds(map.bbox, { padding: 60, maxZoom: 19 })
  }

  async function drawBoundary() {
    const geometry = await editor.draw('polygon')
    if (!geometry) return
    setBusy(true)
    try {
      const multi: MultiPolygon = geometry.type === 'Polygon'
        ? { type: 'MultiPolygon', coordinates: [(geometry as Polygon).coordinates] }
        : (geometry as MultiPolygon)
      const { map } = await api<{ map: MapData }>(`/maps/${editor.map.id}`, { method: 'PATCH', body: { map: { boundary: multi } } })
      editor.setMap(map)
      editor.notify(t('editor.terrain.saved'))
    } catch (error) {
      editor.notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const { map } = await api<{ map: MapData }>(`/maps/${editor.map.id}/boundary_import`, { method: 'POST', body })
      applyMap(map)
      editor.notify(t('map_data.terrain.imported'))
    } catch (error) {
      editor.notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  function flyTo(result: GeocodeResult) {
    if (result.bbox && result.zoom < 17) {
      editor.instance.fitBounds(result.bbox, { padding: 40, maxZoom: result.zoom })
    } else {
      editor.instance.flyTo({ center: [result.lng, result.lat], zoom: result.zoom })
    }
    marker.current?.remove()
    marker.current = new maplibregl.Marker({ color: '#5b5781' }).setLngLat([result.lng, result.lat]).addTo(editor.instance)
  }

  useEffect(() => () => {
    marker.current?.remove()
  }, [])

  useEffect(() => {
    if (!editor.canEdit) return
    const step = consumeStartStep(editor.map.id)
    if (step === 'parcels' && cadastre) setPicking(true)
    else if (step === 'draw') void drawBoundary()
    else if (step === 'import') importButton.current?.focus()
    // Once, when the panel first opens on this map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-5">
      <p className="text-sm text-loam-600">{t('editor.terrain.intro')}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-loam-50 p-3">
          <dt className="text-xs text-loam-500">{t('maps.area')}</dt>
          <dd className="font-medium">{formatArea(editor.map.areaM2)}</dd>
        </div>
        <div className="rounded-lg bg-loam-50 p-3">
          <dt className="text-xs text-loam-500">{t('editor.terrain.parcels')}</dt>
          <dd className="font-medium">{editor.map.parcels.length || '—'}</dd>
        </div>
      </dl>

      <AddressSearch
        regionId={editor.map.region.id}
        label={t('map_data.terrain.find_address')}
        onSelect={flyTo}
      />

      {editor.canEdit && (picking && cadastre ? (
        <ParcelPicker cadastre={cadastre} onDone={() => setPicking(false)} onSaved={applyMap} />
      ) : (
        <section className="space-y-2" aria-labelledby="terrain-outline-title">
          <h3 id="terrain-outline-title" className="text-xs font-semibold uppercase tracking-wide text-loam-500">
            {t('map_data.terrain.outline_title')}
          </h3>
          <Button onClick={() => setPicking(true)} disabled={!cadastre || busy || editor.drawing} className="w-full">
            <Grid2x2Check className="h-4 w-4" />
            {t('map_data.terrain.pick_parcels')}
          </Button>
          {!cadastre && <p className="text-xs text-loam-500">{t('map_data.parcels.errors.unavailable')}</p>}
          <Button onClick={drawBoundary} disabled={busy || editor.drawing} variant="secondary" className="w-full">
            <PenLine className="h-4 w-4" />
            {editor.map.boundary ? t('editor.terrain.redraw') : t('editor.terrain.draw')}
          </Button>
          <button
            ref={importButton}
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || editor.drawing}
            className={buttonClass('secondary', 'md', 'w-full')}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {t('map_data.terrain.import')}
          </button>
          <input ref={fileInput} type="file" accept={IMPORT_ACCEPT} onChange={importFile} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <p className="text-xs text-loam-500">{t('map_data.terrain.import_hint')}</p>
        </section>
      ))}
      {editor.drawing && <p className="text-xs text-loam-500">{t('editor.draw_hint')}</p>}
    </div>
  )
}

/**
 * "Choisir mes parcelles": the cadastre shows on the map, each tap adds or
 * removes the parcel under the finger, "Valider" turns their union into the
 * terrain outline (server side, PostGIS) and keeps their CAPAKEYs.
 */
function ParcelPicker({ cadastre, onDone, onSaved }: {
  cadastre: RegionLayerData
  onDone: () => void
  onSaved: (map: MapData) => void
}) {
  const editor = useEditor()
  const { instance, notify } = editor
  const mapId = editor.map.id
  const [parcels, setParcels] = useState<ParcelData[]>([])
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(() => instance.getZoom())
  const latest = useRef({ parcels, looking, drawing: editor.drawing })
  latest.current = { parcels, looking, drawing: editor.drawing }

  useEffect(() => {
    layerStore.claimClicks('parcels')
    layerStore.force(cadastre.key, true)
    instance.getCanvas().style.cursor = 'crosshair'
    const onZoom = () => setZoom(instance.getZoom())
    instance.on('zoomend', onZoom)
    return () => {
      layerStore.releaseClicks('parcels')
      layerStore.force(cadastre.key, false)
      instance.off('zoomend', onZoom)
      instance.getCanvas().style.cursor = ''
      hideParcelSelection(instance)
    }
  }, [instance, cadastre.key])

  useEffect(() => showParcelSelection(instance, parcels), [instance, parcels])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !latest.current.drawing && onDone()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  useEffect(() => {
    const onClick = async (event: MapMouseEvent) => {
      const current = latest.current
      if (current.drawing || current.looking) return
      const featureLayers = FEATURE_LAYERS.filter((id) => instance.getLayer(id))
      if (featureLayers.length && instance.queryRenderedFeatures(event.point, { layers: featureLayers }).length) return
      const { lng, lat } = event.lngLat
      setLooking(true)
      try {
        const params = new URLSearchParams({ lng: lng.toFixed(7), lat: lat.toFixed(7) })
        const { parcel } = await api<{ parcel: ParcelData }>(`/maps/${mapId}/parcels/lookup?${params}`)
        setParcels((list) => (list.some((p) => p.capakey === parcel.capakey)
          ? list.filter((p) => p.capakey !== parcel.capakey)
          : [...list, parcel]))
      } catch (error) {
        notify(errorMessage(error), error instanceof ApiError && error.status === 404 ? 'info' : 'error')
      } finally {
        setLooking(false)
      }
    }
    const handler = (event: MapMouseEvent) => void onClick(event)
    instance.on('click', handler)
    return () => {
      instance.off('click', handler)
    }
  }, [instance, mapId, notify])

  async function validate() {
    setSaving(true)
    try {
      const { map } = await api<{ map: MapData }>(`/maps/${editor.map.id}/parcels`, {
        method: 'POST',
        body: { parcels: parcels.map(({ capakey, lng, lat }) => ({ capakey, lng, lat })) },
      })
      onSaved(map)
      editor.notify(t('map_data.terrain.parcels_saved', { count: parcels.length }))
      onDone()
    } catch (error) {
      editor.notify(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const total = parcels.reduce((sum, p) => sum + turfArea({ type: 'Feature', geometry: p.geometry, properties: {} }), 0)
  const tooFar = cadastre.minZoom != null && Math.round(zoom) < cadastre.minZoom

  return (
    <section className="space-y-3 rounded-lg bg-prune-50 p-3 ring-1 ring-prune-200" aria-labelledby="parcel-picker-title">
      <div>
        <h3 id="parcel-picker-title" className="text-sm font-semibold text-prune-800">{t('map_data.terrain.pick_parcels')}</h3>
        <p className="mt-1 text-xs text-loam-600">{t('map_data.terrain.pick_hint')}</p>
      </div>
      {tooFar && <p className="text-xs font-medium text-humus-700">{t('map_data.terrain.pick_zoom')}</p>}
      <div aria-live="polite">
        {looking && (
          <p className="flex items-center gap-1.5 text-xs text-loam-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('map_data.terrain.looking')}
          </p>
        )}
        {parcels.length === 0 && !looking && <p className="text-xs text-loam-500">{t('map_data.terrain.no_parcel')}</p>}
      </div>
      {parcels.length > 0 && (
        <>
          <ul className="max-h-48 divide-y divide-prune-100 overflow-y-auto rounded-md bg-white ring-1 ring-prune-100">
            {parcels.map((parcel) => (
              <li key={parcel.capakey} className="flex items-start gap-2 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-loam-800">{parcel.label}</div>
                  {parcel.detail && <div className="truncate text-xs text-loam-500">{parcel.detail}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => setParcels((list) => list.filter((p) => p.capakey !== parcel.capakey))}
                  aria-label={t('map_data.terrain.remove_parcel', { label: parcel.label })}
                  className="rounded p-1 text-loam-400 hover:bg-loam-100 hover:text-loam-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-loam-600">
            {t('map_data.terrain.selection', { count: parcels.length, area: formatArea(total) })}
          </p>
        </>
      )}
      {editor.map.boundary && parcels.length > 0 && <p className="text-xs text-loam-500">{t('map_data.terrain.replace_warning')}</p>}
      <div className="flex gap-2">
        <Button onClick={validate} disabled={parcels.length === 0 || saving || looking} className="flex-1">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('map_data.terrain.validate')}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={saving}>{t('common.cancel')}</Button>
      </div>
    </section>
  )
}
