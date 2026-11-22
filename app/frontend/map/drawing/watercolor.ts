/**
 * « Aquarelle »: the master plan painted, the way the Ferme de Desnié's was
 * by hand, from the exact plan Terranova draws. No image model is involved:
 * the plan's own render is washed, pooled at its edges, granulated and laid
 * on paper, so every pond, path and crown stays where the design put it and
 * nothing is added. The hand only trembles: shapes move by at most
 * `WOBBLE_MM` on the printed sheet.
 *
 * Pure functions on RGBA pixels (testable in node); `watercolorDataUrl`
 * runs them in the browser on a rendered map.
 */

export type Pixels = { data: Uint8ClampedArray; width: number; height: number }

/** How far the hand trembles, in mm on paper (at 200 dpi, about two pixels). */
export const WOBBLE_MM = 0.4
const PRINT_DPI = 200
/** The long side a painting is made at, in pixels (about 2 px per mm on an A0, plenty for a wash). */
export const MAX_PAINT_PX = 2400
const MM_PER_INCH = 25.4

/** The paper: warm cream, like the master plan's sheet. */
const PAPER = [0.984, 0.968, 0.933]

/** A small seeded generator: the same plan always gets the same painting. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth value noise in [0, 1], one value per pixel, with features about `cell` pixels wide. */
export function valueNoise(width: number, height: number, cell: number, seed: number): Float32Array {
  const at = noiseSampler(width, height, cell, seed)
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = at(x, y)
  return out
}

/**
 * Smooth value noise read one pixel at a time: only the coarse grid is
 * kept, so a field costs nothing on an A0 sheet.
 */
export function noiseSampler(width: number, height: number, cell: number, seed: number): (x: number, y: number) => number {
  const random = seeded(seed)
  const gw = Math.ceil(width / cell) + 2
  const gh = Math.ceil(height / cell) + 2
  const grid = new Float32Array(gw * gh)
  for (let i = 0; i < grid.length; i++) grid[i] = random()
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x, y) => {
    const gx = x / cell
    const gy = y / cell
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const tx = smooth(gx - x0)
    const ty = smooth(gy - y0)
    const a = grid[y0 * gw + x0]
    const b = grid[y0 * gw + x0 + 1]
    const c = grid[(y0 + 1) * gw + x0]
    const d = grid[(y0 + 1) * gw + x0 + 1]
    const top = a + (b - a) * tx
    return top + ((c + (d - c) * tx) - top) * ty
  }
}

/** Box blur of one channel, radius `r` pixels, horizontal then vertical (edges clamped). */
export function boxBlur(src: Float32Array, width: number, height: number, r: number): Float32Array {
  if (r < 1) return src.slice()
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const size = 2 * r + 1
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let k = -r; k <= r; k++) sum += src[row + Math.min(width - 1, Math.max(0, k))]
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / size
      sum += src[row + Math.min(width - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(height - 1, Math.max(0, k)) * width + x]
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / size
      sum += tmp[Math.min(height - 1, y + r + 1) * width + x] - tmp[Math.max(0, y - r) * width + x]
    }
  }
  return out
}

/** Pixels per mm on the printed sheet for an image `width` px wide printed `widthMm` wide. */
export const pxPerMm = (width: number, widthMm: number) => width / widthMm

/**
 * Paints `src` in watercolour. `mm` is the size of one printed mm in
 * pixels (the wobble, bleed and pooling are measured on paper, so A3 and A0
 * look alike); `seed` keeps one plan's painting the same from print to print.
 */
export function paintWatercolor(src: Pixels, { mm = PRINT_DPI / MM_PER_INCH, seed = 1 }: { mm?: number; seed?: number } = {}): Pixels {
  const { width, height, data } = src
  const n = width * height
  const at = (v: number) => Math.max(1, Math.round(v))

  // 1. The hand trembles: each pixel is read a little aside, along a slow noise.
  // Two speeds: a slow sway of the whole line, and a fine ragged edge.
  const amp = WOBBLE_MM * mm
  const slowX = noiseSampler(width, height, at(9 * mm), seed)
  const slowY = noiseSampler(width, height, at(9 * mm), seed + 1)
  const fineX = noiseSampler(width, height, at(1.6 * mm), seed + 5)
  const fineY = noiseSampler(width, height, at(1.6 * mm), seed + 6)
  const r = new Float32Array(n)
  const g = new Float32Array(n)
  const b = new Float32Array(n)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const nx = 0.6 * slowX(x, y) + 0.4 * fineX(x, y)
      const ny = 0.6 * slowY(x, y) + 0.4 * fineY(x, y)
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + (nx - 0.5) * 2 * amp)))
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + (ny - 0.5) * 2 * amp)))
      const j = (sy * width + sx) * 4
      r[i] = data[j] / 255
      g[i] = data[j + 1] / 255
      b[i] = data[j + 2] / 255
    }
  }

  // 2. Wet in wet: the colours bleed a little into each other.
  const bleed = at(0.35 * mm)
  const rb = boxBlur(r, width, height, bleed)
  const gb = boxBlur(g, width, height, bleed)
  const bb = boxBlur(b, width, height, bleed)

  // 3. Pigment pools at the edge of a wash: darker just inside a shape.
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) lum[i] = 0.299 * rb[i] + 0.587 * gb[i] + 0.114 * bb[i]
  const around = boxBlur(lum, width, height, at(0.9 * mm))

  // 4. Washes are never even (slow), pigment granulates (fast), the paper has fibres.
  const flow = noiseSampler(width, height, at(14 * mm), seed + 2)
  const grain = noiseSampler(width, height, at(0.35 * mm), seed + 3)
  const fibre = noiseSampler(width, height, at(1.2 * mm), seed + 4)

  const out = new Uint8ClampedArray(n * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const mixR = r[i] * 0.55 + rb[i] * 0.45
      const mixG = g[i] * 0.55 + gb[i] * 0.45
      const mixB = b[i] * 0.55 + bb[i] * 0.45
      const edge = Math.min(1, Math.max(0, (around[i] - lum[i]) * 5))
      // How much pigment there is here: lighter inside a wash, pooled at its edges, uneven and grainy.
      const density = (0.74 + 0.4 * flow(x, y)) * (1 + 0.28 * (grain(x, y) - 0.5)) * (0.82 + 0.55 * edge)
      const paper = 1 - 0.035 * fibre(x, y)
      out[i * 4] = Math.round(255 * PAPER[0] * paper * (1 - Math.min(1, (1 - mixR) * density)))
      out[i * 4 + 1] = Math.round(255 * PAPER[1] * paper * (1 - Math.min(1, (1 - mixG) * density)))
      out[i * 4 + 2] = Math.round(255 * PAPER[2] * paper * (1 - Math.min(1, (1 - mixB) * density)))
      out[i * 4 + 3] = 255
    }
  }
  return { data: out, width, height }
}

/** A seed from a text (the map's id and title): one plan, one painting. */
export function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Paints a rendered map (a data URL) in watercolour and gives back a JPEG
 * data URL of the same size. `widthMm`: how wide it prints.
 */
export async function watercolorDataUrl(url: string, widthMm: number, seed: number): Promise<string> {
  const image = new Image()
  image.src = url
  await image.decode()
  // A watercolour has no fine detail to keep: painted at most MAX_PAINT_PX
  // on its long side, an A0 stays within what a phone or a modest machine holds.
  const shrink = Math.min(1, MAX_PAINT_PX / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * shrink)
  canvas.height = Math.round(image.naturalHeight * shrink)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return url
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  // Let the page breathe before the long paint.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const painted = paintWatercolor({ data: pixels.data, width: canvas.width, height: canvas.height }, { mm: pxPerMm(canvas.width, widthMm), seed })
  pixels.data.set(painted.data)
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.9)
}
