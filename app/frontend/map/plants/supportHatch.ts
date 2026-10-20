import type { Map as MapLibreMap } from 'maplibre-gl'

/** The image support plants' crowns are hatched with (see PlantsOverlay). */
export const SUPPORT_HATCH = 'support-hatch'

const SIZE = 10

/**
 * Diagonal strokes on a transparent tile, white edged with ink so they read
 * on an aerial photo as on a pale plan, laid over a faint strata colour: the
 * colour still says the strata, the hatching says « support ». Added again
 * after a style change, which drops the map's images.
 */
export function ensureSupportHatch(map: Pick<MapLibreMap, 'hasImage' | 'addImage'>) {
  if (map.hasImage(SUPPORT_HATCH)) return
  map.addImage(SUPPORT_HATCH, { width: SIZE, height: SIZE, data: supportHatchPixels() }, { pixelRatio: 1 })
}

/** RGBA pixels of the tile: a stroke from the bottom left to the top right, wrapping. */
export function supportHatchPixels(): Uint8Array {
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = (x + y) % SIZE
      if (d !== SIZE - 1 && d !== 0) continue
      const i = (y * SIZE + x) * 4
      // The white stroke, and its ink edge beside it.
      const [r, g, b, a] = d === 0 ? [255, 255, 255, 235] : [43, 38, 32, 150]
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return data
}
