import type { Feature, FeatureCollection, LineString } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { ensureLabelBackground, markerLabel } from '@/map/layers/labels'
import type { StationsGeoJSON } from '@/types/weather_stations'

export const STATIONS_SOURCE = 'weather-stations'
export const LINK_SOURCE = 'weather-stations-link'
export const STATION_LAYER = 'weather-stations-icon'
export const WEATHER_STATION_LAYER_IDS = [
  'weather-stations-link-casing', 'weather-stations-link-line', 'weather-stations-halo', STATION_LAYER, 'weather-stations-label',
] as const

const ICON = 'weather-station'
const ICON_NEAREST = 'weather-station-nearest'
const PIXEL_RATIO = 2
const PRUNE = '#5b5781'
const INK = '#36342f'
const PAPER = '#f7f3ea'

type Link = FeatureCollection<LineString>
const EMPTY_LINK: Link = { type: 'FeatureCollection', features: [] }

/** A dashed line from the terrain to its nearest station, the way one would pencil it on a field map. */
export function linkToNearest(center: [number, number] | null, stations: StationsGeoJSON | null): Link {
  const nearest = stations?.features.find((f) => f.properties.nearest)
  if (!center || !nearest) return EMPTY_LINK
  const line: Feature<LineString> = {
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [center, nearest.geometry.coordinates] },
  }
  return { type: 'FeatureCollection', features: [line] }
}

/**
 * The station glyph, drawn on a canvas: a louvred instrument shelter (the
 * white box every weather station keeps its thermometers in) on its legs,
 * inside a paper disc. The nearest station is plum, larger.
 */
function stationIcon(size: number, nearest: boolean): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return null
  const s = size
  const ink = nearest ? '#ffffff' : INK
  g.lineWidth = s * 0.07
  g.fillStyle = nearest ? PRUNE : PAPER
  g.strokeStyle = nearest ? '#ffffff' : INK
  g.beginPath()
  g.arc(s / 2, s / 2, s / 2 - g.lineWidth, 0, Math.PI * 2)
  g.fill()
  g.stroke()

  g.strokeStyle = ink
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = s * 0.055
  const left = s * 0.33
  const right = s * 0.67
  const top = s * 0.36
  const bottom = s * 0.6
  g.beginPath()
  // Roof
  g.moveTo(s * 0.29, top)
  g.lineTo(s * 0.5, s * 0.23)
  g.lineTo(s * 0.71, top)
  // Box
  g.rect(left, top, right - left, bottom - top)
  // Louvres
  ;[0.44, 0.52].forEach((y) => {
    g.moveTo(left + s * 0.05, s * y)
    g.lineTo(right - s * 0.05, s * y)
  })
  // Legs
  g.moveTo(s * 0.39, bottom)
  g.lineTo(s * 0.39, s * 0.77)
  g.moveTo(s * 0.61, bottom)
  g.lineTo(s * 0.61, s * 0.77)
  g.stroke()
  return g.getImageData(0, 0, s, s)
}

const watched = new WeakSet<object>()

function ensureIcons(map: MapLibreMap) {
  const add = (id: string) => {
    if (map.hasImage(id)) return
    const image = stationIcon(id === ICON_NEAREST ? 52 : 38, id === ICON_NEAREST)
    if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO })
  }
  add(ICON)
  add(ICON_NEAREST)
  if (!watched.has(map)) {
    watched.add(map)
    map.on('styleimagemissing', (e: { id: string }) => { if (e.id === ICON || e.id === ICON_NEAREST) add(e.id) })
  }
}

/** Keeps the stations above the drawn features (their order depends on who mounted first). */
function raise(map: MapLibreMap) {
  WEATHER_STATION_LAYER_IDS.forEach((id) => map.getLayer(id) && map.moveLayer(id))
}

function setData(map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection): boolean {
  const source = map.getSource(id) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return false
  }
  map.addSource(id, { type: 'geojson', data })
  return true
}

/** Installs (once) the station layers, then only updates their data. */
export function installWeatherStationLayers(map: MapLibreMap, stations: StationsGeoJSON, link: Link) {
  ensureLabelBackground(map)
  ensureIcons(map)
  const created = [setData(map, STATIONS_SOURCE, stations), setData(map, LINK_SOURCE, link)].some(Boolean)
  if (!created) {
    raise(map)
    return
  }
  // Readable on aerial photos as on plans: a light casing under the plum dashes.
  map.addLayer({
    id: 'weather-stations-link-casing', type: 'line', source: LINK_SOURCE,
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': PAPER, 'line-width': 4, 'line-opacity': 0.75 },
  })
  map.addLayer({
    id: 'weather-stations-link-line', type: 'line', source: LINK_SOURCE,
    paint: { 'line-color': PRUNE, 'line-width': 2, 'line-dasharray': [2, 2] },
  })
  map.addLayer({
    id: 'weather-stations-halo', type: 'circle', source: STATIONS_SOURCE, filter: ['==', ['get', 'nearest'], true],
    paint: { 'circle-radius': 21, 'circle-color': PRUNE, 'circle-opacity': 0.25, 'circle-stroke-color': PAPER, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.9 },
  })
  map.addLayer({
    id: STATION_LAYER, type: 'symbol', source: STATIONS_SOURCE,
    layout: {
      'icon-image': ['case', ['==', ['get', 'nearest'], true], ICON_NEAREST, ICON],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['case', ['==', ['get', 'nearest'], true], 0, 1],
    },
  })
  const label = markerLabel(['get', 'name'], { 'text-offset': [0, 1.5], 'text-optional': true })
  map.addLayer({
    id: 'weather-stations-label', type: 'symbol', source: STATIONS_SOURCE,
    layout: { ...label.layout, 'symbol-sort-key': ['case', ['==', ['get', 'nearest'], true], 0, 1] },
    paint: label.paint,
  })
  raise(map)
}

export function setWeatherStationLayersVisible(map: Pick<MapLibreMap, 'getLayer' | 'setLayoutProperty'>, visible: boolean) {
  WEATHER_STATION_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  })
}

export function removeWeatherStationLayers(map: MapLibreMap) {
  try {
    WEATHER_STATION_LAYER_IDS.forEach((id) => map.getLayer(id) && map.removeLayer(id))
    ;[STATIONS_SOURCE, LINK_SOURCE].forEach((id) => map.getSource(id) && map.removeSource(id))
  } catch {
    // The map is being torn down.
  }
}
