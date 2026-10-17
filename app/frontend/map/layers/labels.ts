import type { Map as MapLibreMap, StyleImageMetadata, SymbolLayerSpecification } from 'maplibre-gl'

/**
 * Marker labels: white text on a black pill at 70 % opacity, readable on
 * aerial photos as on plans. MapLibre text has no background of its own, so
 * every label layer stretches a small rounded image around its text
 * (`icon-text-fit`).
 *
 * Zone names get a paper label instead (beige clair, ink text), like a note
 * stuck on the plan: a halo alone vanished on a grey roof or a busy photo.
 */
export const LABEL_IMAGE = 'marker-label-bg'
export const LABEL_OPACITY = 0.7
export const PAPER_LABEL_IMAGE = 'paper-label-bg'
export const PAPER_LABEL_OPACITY = 0.9
/** loam-50 (beige clair), the notebook's paper. */
const PAPER_RGB: [number, number, number] = [0xf7, 0xf3, 0xea]
const PIXEL_RATIO = 2
const RADIUS = 8 // device pixels, 4 CSS px
const SIZE = RADIUS * 2 + 2

type LabelImage = { width: number; height: number; data: Uint8Array } & Partial<StyleImageMetadata>

/** The rounded background, drawn by hand (no canvas) with anti-aliased corners. */
export function labelBackground(rgb: [number, number, number] = [0, 0, 0], opacity = LABEL_OPACITY): LabelImage {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const alpha = Math.round(255 * opacity)
  const samples = 4
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let inside = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples
          const py = y + (sy + 0.5) / samples
          // Distance to the nearest corner centre, only where a corner rounds.
          const cx = Math.min(Math.max(px, RADIUS), SIZE - RADIUS)
          const cy = Math.min(Math.max(py, RADIUS), SIZE - RADIUS)
          if ((px - cx) ** 2 + (py - cy) ** 2 <= RADIUS ** 2) inside++
        }
      }
      const i = (y * SIZE + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = Math.round((alpha * inside) / (samples * samples))
    }
  }
  return {
    width: SIZE,
    height: SIZE,
    data,
    pixelRatio: PIXEL_RATIO,
    stretchX: [[RADIUS, SIZE - RADIUS]],
    stretchY: [[RADIUS, SIZE - RADIUS]],
    content: [RADIUS / 2, RADIUS / 2, SIZE - RADIUS / 2, SIZE - RADIUS / 2],
  }
}

type ImageHost = Pick<MapLibreMap, 'hasImage' | 'addImage'> & { on?: MapLibreMap['on'] }

const watched = new WeakSet<object>()

const BACKGROUNDS: Record<string, () => LabelImage> = {
  [LABEL_IMAGE]: () => labelBackground(),
  [PAPER_LABEL_IMAGE]: () => labelBackground(PAPER_RGB, PAPER_LABEL_OPACITY),
}

/**
 * Registers the background images on the map (again after a basemap style
 * swap, which drops images: the `styleimagemissing` event brings them back).
 */
export function ensureLabelBackground(map: ImageHost) {
  const add = (id: string) => {
    if (map.hasImage(id)) return
    const { width, height, data, ...options } = BACKGROUNDS[id]()
    map.addImage(id, { width, height, data }, options)
  }
  Object.keys(BACKGROUNDS).forEach(add)
  if (map.on && !watched.has(map)) {
    watched.add(map)
    map.on('styleimagemissing', (e: { id: string }) => { if (e.id in BACKGROUNDS) add(e.id) })
  }
}

type Layout = NonNullable<SymbolLayerSpecification['layout']>
type Paint = NonNullable<SymbolLayerSpecification['paint']>

/** Layout and paint of a marker label; `layout` adds or overrides entries (offset, anchor…). */
export function markerLabel(textField: Layout['text-field'], layout: Layout = {}): { layout: Layout; paint: Paint } {
  return {
    layout: {
      'text-field': textField,
      'text-size': 11,
      'text-font': ['Noto Sans Regular'],
      // Just under the marker, so the pill never covers it.
      'text-anchor': 'top',
      'text-offset': [0, 1.1],
      'icon-image': LABEL_IMAGE,
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [1, 4, 1, 4],
      ...layout,
    },
    paint: { 'text-color': '#ffffff' },
  }
}
