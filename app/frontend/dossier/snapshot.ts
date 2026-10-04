import { circle } from '@turf/turf'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { applyLayerVisibility, installDrawingLayers } from '@/map/drawing/style'
import { installBoundary } from '@/map/layers/boundary'
import { installFeatureLayers } from '@/map/layers/features'
import { STRATA_COLORS } from '@/map/plants/strata'
import type { Dossier, DossierRaster } from '@/types/dossier'
import type { Strata } from '@/types/plants'

// MapLibre locates its worker next to its own module, which a bundler moves.
maplibregl.setWorkerUrl(workerUrl)

/**
 * The plan on the dossier's cover: an offscreen MapLibre map of the terrain
 * (the region's aerial photo, optionally the cadastre, the boundary, the
 * accepted features styled like the editor, plants at their adult crown),
 * fitted to the terrain and turned into an image the page can print. Not to
 * scale on paper: the image carries its own scale bar.
 */
export type PlanImage = { url: string; widthPx: number; metersPerPx: number }

const EARTH_CIRCUMFERENCE = 40075016.686
const RENDER_TIMEOUT_MS = 20_000
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
const CROWNS = 'dossier-crowns'

const absolute = (url: string) => (url.startsWith('/') ? `${window.location.origin}${url}` : url)

function rasterSource(layer: DossierRaster) {
  return {
    type: 'raster' as const,
    tiles: [absolute(layer.tileUrl)],
    tileSize: layer.tileSize,
    ...(layer.minZoom != null ? { minzoom: layer.minZoom } : {}),
    ...(layer.maxZoom != null ? { maxzoom: layer.maxZoom } : {}),
  }
}

function baseStyle(cover: Dossier['cover'], withCadastre: boolean): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    glyphs: GLYPHS,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ede9e3' } }],
  }
  if (cover.base) {
    style.sources.base = rasterSource(cover.base)
    style.layers.push({ id: 'base', type: 'raster', source: 'base' })
  }
  if (withCadastre && cover.cadastre) {
    style.sources.cadastre = rasterSource(cover.cadastre)
    style.layers.push({ id: 'cadastre', type: 'raster', source: 'cadastre', paint: { 'raster-opacity': 0.9 } })
  }
  return style
}

/** Adult crowns of the plants, true size, coloured by strata. */
function crowns(cover: Dossier['cover']): FeatureCollection<Polygon, { color: string }> {
  const features: Feature<Polygon, { color: string }>[] = []
  for (const feature of cover.features.features) {
    const crown = feature.properties.dossierCrownM
    if (feature.geometry.type !== 'Point' || typeof crown !== 'number') continue
    const strata = feature.properties.dossierStrata as Strata
    const polygon = circle(feature.geometry.coordinates, Math.max(crown / 2, 0.15) / 1000, { steps: 32, units: 'kilometers' })
    features.push({ ...polygon, properties: { color: STRATA_COLORS[strata] ?? '#3d7d42' } })
  }
  return { type: 'FeatureCollection', features }
}

function installCrowns(map: MapLibreMap, data: FeatureCollection<Polygon, { color: string }>) {
  if (data.features.length === 0) return
  const before = map.getLayer('features-line') ? 'features-line' : undefined
  map.addSource(CROWNS, { type: 'geojson', data })
  map.addLayer({ id: `${CROWNS}-fill`, type: 'fill', source: CROWNS, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 } }, before)
  map.addLayer({ id: `${CROWNS}-line`, type: 'line', source: CROWNS, paint: { 'line-color': ['get', 'color'], 'line-width': 1.2 } }, before)
}

function waitFor(map: MapLibreMap, event: 'load' | 'idle', timeout = RENDER_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, timeout)
    map.once(event, () => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}

/** Renders the plan at `width` × `height` CSS pixels; null without anything to show. */
export async function renderPlan(cover: Dossier['cover'], { width, height, cadastre }: { width: number; height: number; cadastre: boolean }): Promise<PlanImage | null> {
  if (!cover.bbox) return null
  const container = document.createElement('div')
  Object.assign(container.style, { position: 'fixed', left: '-20000px', top: '0', width: `${width}px`, height: `${height}px` })
  document.body.appendChild(container)
  const [w, s, e, n] = cover.bbox
  const map = new maplibregl.Map({
    container,
    style: baseStyle(cover, cadastre),
    bounds: [[w, s], [e, n]],
    fitBoundsOptions: { padding: Math.round(Math.min(width, height) * 0.08), maxZoom: 20 },
    interactive: false,
    attributionControl: false,
    pixelRatio: 2,
    fadeDuration: 0,
    maxZoom: 22,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  })
  try {
    await waitFor(map, 'load')
    installBoundary(map, cover.boundary)
    installFeatureLayers(map, cover.features)
    installDrawingLayers(map)
    applyLayerVisibility(map, [], { activeOnly: true })
    installCrowns(map, crowns(cover))
    await waitFor(map, 'idle')
    const latitude = map.getCenter().lat
    const metersPerPx = (EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** map.getZoom())
    return { url: map.getCanvas().toDataURL('image/jpeg', 0.9), widthPx: width, metersPerPx }
  } finally {
    map.remove()
    container.remove()
  }
}

/** A round scale bar no longer than a quarter of the image. */
export function scaleBar(image: PlanImage): { meters: number; percent: number } {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]
  const imageMeters = image.metersPerPx * image.widthPx
  const meters = steps.filter((m) => m <= imageMeters / 4).pop() ?? steps[0]
  return { meters, percent: (meters / imageMeters) * 100 }
}
