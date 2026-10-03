// Hillshade of the relief for the 2D map's overlay (Horn's slope, light from
// the north-west as on topographic maps). Pure functions, no import.

/** Lighting of each cell, 0 (in its own shade) to 1 (facing the light). */
export function hillshade(
  heights: Float32Array, cols: number, rows: number, cellSize: number,
  { azimuth = 315, altitude = 45, zFactor = 1 }: { azimuth?: number; altitude?: number; zFactor?: number } = {},
): Float32Array {
  const out = new Float32Array(cols * rows)
  const zenith = ((90 - altitude) * Math.PI) / 180
  // Azimuth clockwise from north → maths angle of the light direction.
  const az = ((360 - azimuth + 90) % 360) * (Math.PI / 180)
  const cosZ = Math.cos(zenith)
  const sinZ = Math.sin(zenith)
  const at = (c: number, r: number) =>
    heights[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))]
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = at(c - 1, r - 1), b = at(c, r - 1), d = at(c + 1, r - 1)
      const e = at(c - 1, r), f = at(c + 1, r)
      const g = at(c - 1, r + 1), h = at(c, r + 1), i = at(c + 1, r + 1)
      // The usual (ESRI) convention: dz/dx eastward, dz/dy southward, so
      // the aspect is the downslope direction as a maths angle.
      const dzdx = ((d + 2 * f + i) - (a + 2 * e + g)) / (8 * cellSize)
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + d)) / (8 * cellSize)
      const slope = Math.atan(zFactor * Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      const value = cosZ * Math.cos(slope) + sinZ * Math.sin(slope) * Math.cos(az - aspect)
      out[r * cols + c] = Math.max(0, value)
    }
  }
  return out
}

/**
 * RGBA pixels of a hillshade meant to lie over a map: flat ground is
 * transparent, slopes away from the light darken, slopes facing it lighten.
 */
export function shadePixels(shade: Float32Array, { altitude = 45, strength = 420 } = {}): Uint8ClampedArray {
  const flat = Math.sin((altitude * Math.PI) / 180)
  const pixels = new Uint8ClampedArray(shade.length * 4)
  for (let k = 0; k < shade.length; k++) {
    const delta = shade[k] - flat
    const o = k * 4
    if (delta < 0) {
      pixels[o] = 38; pixels[o + 1] = 33; pixels[o + 2] = 25
      pixels[o + 3] = Math.min(190, -delta * strength)
    } else {
      pixels[o] = 255; pixels[o + 1] = 252; pixels[o + 2] = 240
      pixels[o + 3] = Math.min(110, delta * strength * 0.6)
    }
  }
  return pixels
}
