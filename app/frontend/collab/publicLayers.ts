import type { Map as MapLibreMap } from 'maplibre-gl'
import type { PublicLayer } from '@/types/collab'

const id = (layer: PublicLayer) => `region-${layer.key}`
// Plain concatenation: `new URL()` would percent-encode the {z}/{x}/{y}
// placeholders and MapLibre would never fill them in.
const absolute = (path: string) => (path.startsWith('/') ? `${window.location.origin}${path}` : path)

/**
 * Region layers of a public view: raster tiles fetched through the
 * publication's own tile proxy (never from the provider directly). The first
 * base layer sits under the overlays and hides the neutral OpenStreetMap
 * fallback. Returns a function removing what was added.
 */
export function installPublicLayers(map: MapLibreMap, layers: PublicLayer[]): () => void {
  const base = layers.find((l) => l.category === 'base')
  const shown = [...(base ? [base] : []), ...layers.filter((l) => l.category === 'overlay')]
  const added: string[] = []
  for (const layer of shown) {
    if (map.getSource(id(layer))) continue
    map.addSource(id(layer), {
      type: 'raster',
      tiles: [absolute(layer.tiles)],
      tileSize: 256,
      ...(layer.minZoom != null ? { minzoom: layer.minZoom } : {}),
      ...(layer.maxZoom != null ? { maxzoom: layer.maxZoom } : {}),
      ...(layer.attribution ? { attribution: layer.attribution } : {}),
    })
    map.addLayer({ id: id(layer), type: 'raster', source: id(layer), paint: { 'raster-opacity': layer.category === 'base' ? 1 : layer.opacity } })
    added.push(id(layer))
  }
  if (base && map.getLayer('osm')) map.setLayoutProperty('osm', 'visibility', 'none')
  return () => {
    added.forEach((layerId) => {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(layerId)) map.removeSource(layerId)
    })
    if (map.getLayer('osm')) map.setLayoutProperty('osm', 'visibility', 'visible')
  }
}
