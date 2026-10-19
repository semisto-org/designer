// The watercolour garden on the public view's map: one symbol per plant,
// painted with the time-lapse's sprites and sized to its crown in metres at
// every zoom. Sprites are cut from the atlases as they are first needed.
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import atlasUrl from '@/components/site/timelapse/paint/atlas.webp'
import smallUrl from '@/components/site/timelapse/paint/small.webp'
import { spriteRect, type SpriteKey } from '@/components/site/timelapse/paint'
import { gardenGeoJson, type PaintedPlant } from './garden'

export const GARDEN_SOURCE = 'public-garden'
const GARDEN_LAYER = 'public-garden-crowns'

export type Atlases = { atlas: HTMLImageElement; small: HTMLImageElement }

function image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

let loading: Promise<Atlases> | null = null

/** The two sheets of watercolour crowns, loaded once. */
export function loadAtlases(): Promise<Atlases> {
  loading ??= Promise.all([image(atlasUrl), image(smallUrl)]).then(([atlas, small]) => ({ atlas, small }))
  return loading
}

/** Draws one sprite of its atlas onto a canvas context, centred, `size` pixels wide. */
export function drawSprite(ctx: CanvasRenderingContext2D, atlases: Atlases, sprite: SpriteKey, size: number) {
  const rect = spriteRect(sprite)
  ctx.drawImage(rect.small ? atlases.small : atlases.atlas, rect.x, rect.y, rect.side, rect.side, -size / 2, -size / 2, size, size)
}

function addSprite(map: MapLibreMap, atlases: Atlases, sprite: SpriteKey) {
  const id = `garden-${sprite}`
  if (map.hasImage(id)) return
  const { side } = spriteRect(sprite)
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.translate(side / 2, side / 2)
  drawSprite(ctx, atlases, sprite, side)
  map.addImage(id, ctx.getImageData(0, 0, side, side))
}

/** Pixels per metre on the ground at a zoom level (512 px tiles). */
function pixelsPerMeter(zoom: number, latitude: number) {
  return (512 * 2 ** zoom) / (40075016.686 * Math.cos((latitude * Math.PI) / 180))
}

/**
 * Installs the garden's source and layer (idempotent), under the outlines
 * and points of the published elements, and paints `painted` on it.
 */
export function paintGarden(map: MapLibreMap, atlases: Atlases, painted: PaintedPlant[], latitude: number) {
  new Set(painted.map((p) => p.sprite)).forEach((sprite) => addSprite(map, atlases, sprite))
  const data = gardenGeoJson(painted)
  const source = map.getSource(GARDEN_SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  map.addSource(GARDEN_SOURCE, { type: 'geojson', data })
  // The plants are their crowns now: their points shrink to a dot (still clickable).
  if (map.getLayer('features-point')) {
    const plant = ['==', ['get', 'layer'], 'plants']
    map.setPaintProperty('features-point', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 14, ['case', plant, 1.5, 3], 20, ['case', plant, 3, 9]] as never)
    map.setPaintProperty('features-point', 'circle-stroke-opacity', ['case', plant, 0.5, 1] as never)
  }
  const size = (zoom: number) => ['*', ['get', 'scale'], pixelsPerMeter(zoom, latitude)]
  map.addLayer({
    id: GARDEN_LAYER,
    type: 'symbol',
    source: GARDEN_SOURCE,
    layout: {
      'icon-image': ['get', 'sprite'],
      'icon-size': ['interpolate', ['exponential', 2], ['zoom'], 10, size(10), 24, size(24)] as never,
      'icon-rotate': ['get', 'rotation'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'height'],
    },
    paint: { 'icon-opacity': 0.95 },
  }, map.getLayer('features-line') ? 'features-line' : undefined)
}

export function removeGarden(map: MapLibreMap) {
  if (map.getLayer(GARDEN_LAYER)) map.removeLayer(GARDEN_LAYER)
  if (map.getSource(GARDEN_SOURCE)) map.removeSource(GARDEN_SOURCE)
}
