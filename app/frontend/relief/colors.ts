// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
// Colour ramps of the relief's base layers. No import.

export type RGB = [number, number, number]
export type Ramp = Array<[number, RGB]>

/** Interpolate a ramp at t ∈ [0, 1]. */
export function ramp(t: number, stops: Ramp): RGB {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))
  for (let k = 1; k < stops.length; k++) {
    const [t1, c1] = stops[k]
    const [t0, c0] = stops[k - 1]
    if (x <= t1) {
      const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0)
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * f)) as RGB
    }
  }
  return stops[stops.length - 1][1]
}

export function hexToRgb(hex: string): RGB {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((ch) => ch + ch).join('') : value
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Altitudes: green lowlands → olive → sand → brown → pale summits. */
export const HYPSOMETRY: Ramp = [
  [0, [47, 107, 58]], [0.25, [127, 174, 90]], [0.5, [216, 199, 122]], [0.75, [176, 125, 79]], [1, [241, 238, 230]],
]

/** Hours of sun: few (indigo) → full sun (yellow). */
export const SUN_RAMP: Ramp = [
  [0, [30, 27, 75]], [0.33, [109, 40, 217]], [0.66, [245, 158, 11]], [1, [253, 224, 71]],
]

/** Height above ground: grass, shrubs, small trees, tall trees. */
export const CANOPY_RAMP: Ramp = [
  [0, [231, 222, 196]], [0.04, [190, 214, 140]], [0.15, [106, 168, 79]], [0.4, [39, 110, 52]], [1, [12, 54, 28]],
]
export const CANOPY_MAX = 30

export const WETNESS_RAMP: Ramp = [
  [0, [236, 224, 190]], [0.35, [200, 210, 140]], [0.55, [110, 175, 100]], [0.75, [40, 140, 140]], [1, [30, 70, 160]],
]

export const FROST_RAMP: Ramp = [
  [0, [244, 239, 228]], [0.33, [205, 222, 240]], [0.66, [130, 160, 225]], [1, [70, 60, 170]],
]

/** Flow axes: light blue (small catchment) → deep blue (large), by log of drained area. */
export function axisColor(t: number): [number, number, number, number] {
  return [125 - 96 * t, 211 - 133 * t, 252 - 36 * t, 170 + 85 * t]
}

/** Water depth on the terrain: 1 mm film to 1 m pond, logarithmic. */
export function waterColor(depth: number): [number, number, number, number] {
  if (depth < 0.0005) return [0, 0, 0, 0]
  const t = Math.max(0, Math.min(1, Math.log10(depth * 1000) / 3))
  const fade = Math.min(1, (depth - 0.0005) / 0.004)
  return [150 - 130 * t, 215 - 125 * t, 250 - 60 * t, (70 + 170 * t) * fade]
}
