import { addProtocol, type GeoJSONSource, type Map as MapLibreMap, type RasterTileSource } from 'maplibre-gl'
import { PMTiles } from 'pmtiles'
import { type LngLat, type Similarity, sourceTiles, tileTransform } from '@/drone/alignment'

// The live preview of « Recaler la vue »: tiles of a drone view drawn where
// its landmark pairs move it, before the server cuts them again for good.
// A MapLibre raster source `aerialshift://<viewId>/{z}/{x}/{y}?r=<rev>`
// whose every tile is composed in a canvas from the archive's own tiles,
// moved (and turned) by the current similarity. Read through the same
// PMTiles archive the map shows; nothing is sent to the server.

const SIZE = 256
const CACHE = 192

type Preview = { archive: PMTiles; similarity: Similarity; rev: number }

const previews = new Map<number, Preview>()
const bitmaps = new Map<string, Promise<ImageBitmap | null>>()
let registered = false

/** Starts (or updates) the preview of a view read from `archiveUrl`. */
export function setPreview(viewId: number, archiveUrl: string, similarity: Similarity): string {
  ensureProtocol()
  const url = new URL(archiveUrl, window.location.href).href
  const current = previews.get(viewId)
  const archive = current && current.archive.source.getKey() === url ? current.archive : new PMTiles(url)
  const rev = (current?.rev ?? 0) + 1
  previews.set(viewId, { archive, similarity, rev })
  return `aerialshift://${viewId}/{z}/{x}/{y}?r=${rev}`
}

export function clearPreview(viewId: number) {
  previews.delete(viewId)
  bitmaps.clear()
}


function ensureProtocol() {
  if (registered) return
  addProtocol('aerialshift', async (params, abort) => {
    const match = /^aerialshift:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url)
    if (!match) throw new Error('aerialshift: bad url')
    const [viewId, z, x, y] = match.slice(1).map(Number)
    const preview = previews.get(viewId)
    if (!preview) throw new Error('aerialshift: no preview')
    return { data: await composeTile(preview, z, x, y, abort.signal) }
  })
  registered = true
}

function sourceBitmap(archive: PMTiles, z: number, x: number, y: number, signal: AbortSignal): Promise<ImageBitmap | null> {
  const key = `${archive.source.getKey()}|${z}/${x}/${y}`
  let found = bitmaps.get(key)
  if (!found) {
    found = archive
      .getZxy(z, x, y, signal)
      .then((tile) => (tile?.data ? createImageBitmap(new Blob([tile.data])) : null))
      .catch(() => null)
    bitmaps.set(key, found)
    // Forget the oldest: a long session stays light.
    if (bitmaps.size > CACHE) bitmaps.delete(bitmaps.keys().next().value as string)
    // An aborted read must be tried again next time.
    found.then((bitmap) => {
      if (!bitmap && signal.aborted) bitmaps.delete(key)
    })
  }
  return found
}

async function composeTile(preview: Preview, z: number, x: number, y: number, signal: AbortSignal): Promise<ArrayBuffer> {
  const { x0, x1, y0, y1 } = sourceTiles(preview.similarity, z, x, y)
  const reads: Promise<[number, number, ImageBitmap | null]>[] = []
  // A tile turned by a few degrees needs at most a 3 × 3 block around it.
  for (let i = x0; i <= Math.min(x1, x0 + 2); i += 1) {
    for (let j = y0; j <= Math.min(y1, y0 + 2); j += 1) {
      reads.push(sourceBitmap(preview.archive, z, i, j, signal).then((bitmap) => [i, j, bitmap]))
    }
  }
  const tiles = await Promise.all(reads)
  const canvas = makeCanvas()
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (context) {
    context.setTransform(...tileTransform(preview.similarity, z, x, y, SIZE))
    tiles.forEach(([i, j, bitmap]) => {
      if (bitmap) context.drawImage(bitmap, i * SIZE, j * SIZE, SIZE, SIZE)
    })
  }
  return encode(canvas)
}

function makeCanvas(): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(SIZE, SIZE)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  return canvas
}

async function encode(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/png' })
    : await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'))
  return blob.arrayBuffer()
}

const PREVIEW = 'aerial-align-preview'
const LINKS = 'aerial-align-links'
const LINKS_CASING = 'aerial-align-links-casing'
// prune-600, as the landmark pins.
const LINK_COLOR = '#5b5781'

/**
 * Puts the preview of a realigned view where the view itself sits (right
 * above its own hidden layer), and the dashed lines from each landmark's
 * point on the unmoved view to its real place, on top. Returns a function
 * taking them down.
 */
export function installPreview(
  map: MapLibreMap,
  view: { id: number; url: string; minZoom: number | null; maxZoom: number | null },
  aboveLayer: string,
): () => void {
  const url = setPreview(view.id, view.url, { a: 1, b: 0, tu: 0, tv: 0 })
  const order = map.getLayersOrder()
  const index = order.indexOf(aboveLayer)
  const before = index >= 0 ? order[index + 1] : undefined
  map.addSource(PREVIEW, {
    type: 'raster', tiles: [url], tileSize: 256,
    ...(view.minZoom != null ? { minzoom: view.minZoom } : {}),
    ...(view.maxZoom != null ? { maxzoom: view.maxZoom } : {}),
  })
  map.addLayer({ id: PREVIEW, type: 'raster', source: PREVIEW, paint: { 'raster-fade-duration': 0 } }, before)
  map.addSource(LINKS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  // A white casing keeps the dashes readable over any photo.
  map.addLayer({ id: LINKS_CASING, type: 'line', source: LINKS, layout: { 'line-cap': 'round' }, paint: { 'line-color': 'white', 'line-width': 5, 'line-opacity': 0.8 } })
  map.addLayer({ id: LINKS, type: 'line', source: LINKS, paint: { 'line-color': LINK_COLOR, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } })
  return () => {
    clearPreview(view.id)
    if (!map.getStyle()) return
    ;[LINKS, LINKS_CASING, PREVIEW].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    ;[LINKS, PREVIEW].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id)
    })
  }
}

/** Moves the preview: its tiles are composed again with `similarity`. */
export function movePreview(map: MapLibreMap, view: { id: number; url: string }, similarity: Similarity) {
  map.getSource<RasterTileSource>(PREVIEW)?.setTiles([setPreview(view.id, view.url, similarity)])
}

export function setPreviewOpacity(map: MapLibreMap, opacity: number) {
  if (map.getLayer(PREVIEW)) map.setPaintProperty(PREVIEW, 'raster-opacity', opacity)
}

/** The dashed lines, one per landmark pair with both ends. */
export function setPreviewLinks(map: MapLibreMap, links: [LngLat, LngLat][]) {
  map.getSource<GeoJSONSource>(LINKS)?.setData({
    type: 'FeatureCollection',
    features: links.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
  })
}
