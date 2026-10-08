// Pure helpers of the canopy overlay (no React, no MapLibre): the colour
// ramp by height, the grid decoding and painting, and where the raster goes
// in the layer stack. Tested in test/frontend/canopy.

export type CanopyBounds = { west: number; south: number; east: number; north: number }
export type Rgba = [number, number, number, number]

/**
 * Height classes, lowest first: ground (< 1 m) stays transparent. Sap greens,
 * pale for shrubs and hedges, deep for the tallest trees, like a watercolour
 * wash over the plan (the leaf scale of the design system is too yellow to
 * read as foliage).
 */
export const CANOPY_RAMP: { min: number; color: Rgba }[] = [
  { min: 1, color: [214, 228, 186, 120] }, // shrubs and hedges
  { min: 3, color: [166, 204, 128, 175] }, // small trees
  { min: 10, color: [104, 160, 84, 195] },
  { min: 20, color: [52, 114, 58, 210] },
  { min: 30, color: [24, 70, 40, 225] }, // the tallest trees
]

/** The colour of a height in metres, or null for bare ground. */
export function canopyColor(height: number): Rgba | null {
  let found: Rgba | null = null
  for (const step of CANOPY_RAMP) if (height >= step.min) found = step.color
  return found
}

/** The grid sent by the server: base64, one byte per cell, metres. */
export function decodeGrid(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** RGBA pixels of the grid, row by row from the north-west corner. */
export function paintHeights(heights: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const lookup = Array.from({ length: 256 }, (_, h) => canopyColor(h))
  const count = Math.min(heights.length, width * height)
  for (let i = 0; i < count; i++) {
    const color = lookup[heights[i]]
    if (!color) continue
    pixels.set(color, i * 4)
  }
  return pixels
}

/** Corners of an image source: top-left, top-right, bottom-right, bottom-left. */
export function gridCorners(b: CanopyBounds): [[number, number], [number, number], [number, number], [number, number]] {
  return [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]]
}

// The terrain outline and the drawing stay above the canopy.
const ABOVE = /^(boundary-|features-|drawing-|parcel)/

/** The layer to insert the canopy raster before, so it sits under the outline and the drawing. */
export function canopyBeforeId(order: string[], self: string): string | undefined {
  return order.find((id) => id !== self && ABOVE.test(id))
}
