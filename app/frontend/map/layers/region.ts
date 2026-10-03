import type {
  LayerSpecification, Map as MapLibreMap, SourceSpecification, StyleSpecification,
} from 'maplibre-gl'
import type { BBox, RegionLayerData } from '@/types'

/**
 * The region catalogue on the map: base maps (a MapLibre style or a raster)
 * and raster data overlays, stacked by `position` UNDER everything else the
 * editor draws (terrain outline, features, tools). Ids are stable
 * (`region-<key>`), installation is idempotent and switching a layer off
 * only hides it, so switching it back is instant.
 */
export const REGION_PREFIX = 'region-'
const FALLBACK_SUFFIX = '--fallback'

/** The neutral raster of MapView's own style, hidden once a base is shown. */
const MAPVIEW_FALLBACK_LAYER = 'osm'
const MAPVIEW_BACKGROUND = 'background'

export type RegionView = {
  base: string | null
  overlays: string[]
  opacity: Record<string, number>
  bounds: BBox | null
}

type Entry = { key: string; position: number; ids: string[]; hiddenByStyle: Set<string> }
type Registry = { entries: Map<string, Entry>; pending: Map<string, Promise<void>>; failed: Set<string>; view: RegionView | null }

const registries = new WeakMap<MapLibreMap, Registry>()

function registry(map: MapLibreMap): Registry {
  let r = registries.get(map)
  if (!r) {
    r = { entries: new Map(), pending: new Map(), failed: new Set(), view: null }
    registries.set(map, r)
  }
  return r
}

export const regionSourceId = (key: string) => `${REGION_PREFIX}${key}`

/** The catalogue key behind a source id, if it is one of ours. */
export function regionKeyOfSource(sourceId: string | undefined): string | null {
  if (!sourceId?.startsWith(REGION_PREFIX)) return null
  return sourceId.slice(REGION_PREFIX.length).split('--')[0] || null
}

const positionOf = (layer: RegionLayerData) => layer.position ?? 0

const absolute = (url: string) => (url.startsWith('/') ? `${window.location.origin}${url}` : url)

/**
 * The lowest layer that is not ours nor MapView's fallback: everything of
 * the region goes below it (boundary, features and tools stay on top).
 */
function anchorId(map: MapLibreMap): string | undefined {
  return map.getStyle().layers.find(
    (l) => l.id !== MAPVIEW_BACKGROUND && l.id !== MAPVIEW_FALLBACK_LAYER && !l.id.startsWith(REGION_PREFIX),
  )?.id
}

/** Insert below the next installed region layer of higher position. */
function beforeIdFor(map: MapLibreMap, position: number): string | undefined {
  let next: Entry | null = null
  registry(map).entries.forEach((entry) => {
    if (entry.position > position && entry.ids.length > 0 && (!next || entry.position < next.position)) next = entry
  })
  const id = (next as Entry | null)?.ids.find((layerId) => map.getLayer(layerId))
  return id ?? anchorId(map)
}

function isVisible(layer: RegionLayerData, view: RegionView) {
  return layer.category === 'base' ? view.base === layer.key : view.overlays.includes(layer.key)
}

type RasterSource = { url: string; tileSize: number; minzoom: number; maxzoom: number; attribution: string | null; suffix: string }

function rasterSourceOf(layer: RegionLayerData): RasterSource | null {
  if (!layer.tileUrl) return null
  return {
    url: layer.tileUrl, tileSize: layer.tileSize ?? 256, minzoom: layer.minZoom ?? 0, maxzoom: layer.maxZoom ?? 22,
    attribution: layer.attribution, suffix: '',
  }
}

/** The raster a style base falls back to when its style cannot load. */
function fallbackSourceOf(layer: RegionLayerData): RasterSource | null {
  const fallback = layer.options.fallback as { url?: string; attribution?: string } | undefined
  if (!fallback?.url) return null
  return { url: fallback.url, tileSize: 256, minzoom: 0, maxzoom: 19, attribution: fallback.attribution ?? null, suffix: FALLBACK_SUFFIX }
}

function installRaster(map: MapLibreMap, layer: RegionLayerData, view: RegionView, source: RasterSource | null) {
  if (!source) return
  const id = regionSourceId(layer.key) + source.suffix
  if (!map.getSource(id)) {
    map.addSource(id, {
      type: 'raster',
      tiles: [absolute(source.url)],
      tileSize: source.tileSize,
      minzoom: source.minzoom,
      maxzoom: source.maxzoom,
      // Proxied tiles only exist inside the region: never ask for others.
      ...(view.bounds && layer.proxied && !source.suffix ? { bounds: view.bounds } : {}),
      ...(source.attribution ? { attribution: source.attribution } : {}),
    })
  }
  if (!map.getLayer(id)) {
    map.addLayer(
      { id, type: 'raster', source: id, paint: { 'raster-opacity': 1, 'raster-fade-duration': 150 } },
      beforeIdFor(map, positionOf(layer)),
    )
  }
  const entry = registry(map).entries.get(layer.key)
  if (entry) entry.ids.push(id)
  else registry(map).entries.set(layer.key, { key: layer.key, position: positionOf(layer), ids: [id], hiddenByStyle: new Set() })
}

// Images of an imported style live under their own sprite id: a single
// sprite becomes "<prefix>-default:<name>", a named one "<prefix>-<id>:<name>".
const IMAGE_PROPERTIES = ['icon-image', 'fill-pattern', 'line-pattern', 'fill-extrusion-pattern', 'background-pattern']

function prefixImage(value: unknown, prefix: string, single: boolean): unknown {
  if (typeof value === 'string') {
    if (single) return `${prefix}-default:${value}`
    const [sprite, ...name] = value.split(':')
    return name.length ? `${prefix}-${sprite}:${name.join(':')}` : value
  }
  if (single && Array.isArray(value)) return ['concat', `${prefix}-default:`, ['to-string', value]]
  return value
}

async function installStyle(map: MapLibreMap, layer: RegionLayerData): Promise<void> {
  const response = await fetch(layer.tileUrl ?? '', { credentials: 'omit' })
  if (!response.ok) throw new Error(`style ${response.status}`)
  const style = (await response.json()) as StyleSpecification
  const prefix = regionSourceId(layer.key)

  if (style.glyphs && !map.getGlyphs()) map.setGlyphs(style.glyphs)
  const single = typeof style.sprite === 'string'
  const sprites = typeof style.sprite === 'string' ? [{ id: 'default', url: style.sprite }] : style.sprite ?? []
  sprites.forEach(({ id, url }) => {
    try { map.addSprite(`${prefix}-${id}`, url) } catch { /* already added */ }
  })

  Object.entries(style.sources ?? {}).forEach(([id, source]) => {
    const sourceId = `${prefix}--${id}`
    if (map.getSource(sourceId)) return
    const spec = { ...source } as SourceSpecification & { attribution?: string }
    if (layer.attribution && spec.type !== 'geojson') spec.attribution = layer.attribution
    map.addSource(sourceId, spec)
  })

  const ids: string[] = []
  const hiddenByStyle = new Set<string>()
  const before = beforeIdFor(map, positionOf(layer))
  ;(style.layers ?? []).forEach((spec) => {
    const id = `${prefix}--${spec.id}`
    ids.push(id)
    if (map.getLayer(id)) return
    const copy = { ...spec, id } as LayerSpecification & { source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }
    if ('source' in spec && typeof spec.source === 'string') copy.source = `${prefix}--${spec.source}`
    if (copy.layout) copy.layout = { ...copy.layout }
    if (copy.paint) copy.paint = { ...copy.paint }
    IMAGE_PROPERTIES.forEach((property) => {
      const group = property === 'icon-image' ? copy.layout : copy.paint
      if (group && property in group) group[property] = prefixImage(group[property], prefix, single)
    })
    if (copy.layout?.visibility === 'none') hiddenByStyle.add(id)
    map.addLayer(copy as LayerSpecification, before)
  })
  registry(map).entries.set(layer.key, { key: layer.key, position: positionOf(layer), ids, hiddenByStyle })
}

function applyVisibility(map: MapLibreMap, layers: RegionLayerData[], view: RegionView) {
  const r = registry(map)
  let baseShown = false
  layers.forEach((layer) => {
    const entry = r.entries.get(layer.key)
    if (!entry) return
    const visible = isVisible(layer, view)
    if (visible && layer.category === 'base') baseShown = true
    entry.ids.forEach((id) => {
      if (!map.getLayer(id)) return
      const show = visible && !entry.hiddenByStyle.has(id)
      map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none')
      if (layer.category === 'overlay' && map.getLayer(id)?.type === 'raster') {
        map.setPaintProperty(id, 'raster-opacity', view.opacity[layer.key] ?? layer.opacity)
      }
    })
  })
  if (map.getLayer(MAPVIEW_FALLBACK_LAYER)) {
    map.setLayoutProperty(MAPVIEW_FALLBACK_LAYER, 'visibility', baseShown ? 'none' : 'visible')
  }
}

/**
 * Brings the map in line with `view`. Raster layers install synchronously;
 * a style base installs once fetched (then the latest view is re-applied).
 * `onError(key)` is called when a style base cannot load (its raster
 * fallback, if any, is shown instead).
 */
export function syncRegionLayers(
  map: MapLibreMap, layers: RegionLayerData[], view: RegionView, onError: (key: string) => void,
) {
  const r = registry(map)
  r.view = view
  const sorted = [...layers].sort((a, b) => positionOf(a) - positionOf(b))
  sorted.forEach((layer) => {
    if (!isVisible(layer, view) || r.entries.has(layer.key) || r.pending.has(layer.key)) return
    if (layer.kind !== 'style') {
      installRaster(map, layer, view, rasterSourceOf(layer))
      return
    }
    if (r.failed.has(layer.key)) return
    const pending = installStyle(map, layer)
      .catch(() => {
        r.failed.add(layer.key)
        onError(layer.key)
        if (r.view && map.getStyle()) installRaster(map, layer, r.view, fallbackSourceOf(layer))
      })
      .finally(() => {
        r.pending.delete(layer.key)
        if (r.view && map.getStyle()) applyVisibility(map, layers, r.view)
      })
    r.pending.set(layer.key, pending)
  })
  applyVisibility(map, layers, view)
}
