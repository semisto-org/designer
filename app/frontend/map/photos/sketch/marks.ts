import type { SketchMark, SketchLine, SketchText } from '@/types/soil_photos'

// Marks live in the photo's frame: x and y from 0 to 1 of its width and
// height, sizes as fractions of its width (PhotoSketch on the server).

export const LINE_WIDTHS = { fine: 0.003, medium: 0.006, bold: 0.012 } as const
export const TEXT_SIZES = { fine: 0.03, medium: 0.045, bold: 0.065 } as const
export type WidthKey = keyof typeof LINE_WIDTHS

/** Handwriting, as the field notebook of the home page. */
export const HAND_FONT = '"Caveat Variable", "Bradley Hand", "Segoe Print", cursive'

/** Light inks get a dark halo, dark inks a light one, so both read on any photo. */
export function haloFor(color: string): string {
  const n = parseInt(color.slice(1), 16)
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return luminance > 0.6 ? 'rgba(27, 23, 18, 0.55)' : 'rgba(255, 255, 255, 0.7)'
}

const round = (value: number) => Math.round(value * 10000) / 10000

/** Drops points closer than `min` to the previous one and rounds the rest (smaller payload, same line). */
export function simplify(points: [number, number][], min = 0.0015): [number, number][] {
  const kept: [number, number][] = []
  for (const [x, y] of points) {
    const last = kept[kept.length - 1]
    if (!last || Math.hypot(x - last[0], (y - last[1])) >= min) kept.push([round(x), round(y)])
  }
  const end = points[points.length - 1]
  if (end && kept.length > 1) kept[kept.length - 1] = [round(end[0]), round(end[1])]
  return kept
}

/**
 * SVG path of a hand-drawn line, smoothed with quadratic curves through the
 * midpoints. `w` and `h` scale the frame to the drawing surface.
 */
export function linePath(points: [number, number][], w: number, h: number): string {
  if (points.length === 0) return ''
  const p = points.map(([x, y]) => [x * w, y * h])
  if (p.length === 1) return `M${p[0][0]},${p[0][1]} l0.01,0`
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2
    const my = (p[i][1] + p[i + 1][1]) / 2
    d += ` Q${p[i][0]},${p[i][1]} ${mx},${my}`
  }
  const last = p[p.length - 1]
  return `${d} L${last[0]},${last[1]}`
}

function distanceToSegment(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length))
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
}

/**
 * The index of the topmost mark under a point (frame coordinates), for the
 * eraser. `aspect` is width / height of the photo: distances are measured in
 * units of its width.
 */
export function markAt(marks: SketchMark[], x: number, y: number, aspect: number, tolerance = 0.015): number {
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i]
    if (mark.type === 'line') {
      const reach = Math.max(mark.width / 2, tolerance)
      const pts = mark.points.map(([px, py]) => [px, py / aspect] as [number, number])
      const py = y / aspect
      if (pts.length === 1 && Math.hypot(x - pts[0][0], py - pts[0][1]) <= reach) return i
      for (let k = 1; k < pts.length; k++) if (distanceToSegment(x, py, pts[k - 1], pts[k]) <= reach) return i
    } else {
      const [left, top, right, bottom] = textBox(mark, aspect)
      if (x >= left - tolerance && x <= right + tolerance && y >= top && y <= bottom) return i
    }
  }
  return -1
}

/** Approximate box of a note (left, top, right, bottom in frame units): handwriting is about half as wide as tall per letter. */
export function textBox(mark: SketchText, aspect: number): [number, number, number, number] {
  const width = mark.text.length * mark.size * 0.45
  const height = mark.size * aspect
  return [mark.x, mark.y - height * 0.8, mark.x + width, mark.y + height * 0.25]
}

export const isLine = (mark: SketchMark): mark is SketchLine => mark.type === 'line'

/**
 * The photo with its sketch, flattened into a JPEG at the image's size, for
 * a download (a photo weighs several times less in JPEG than in PNG). The image goes through fetch so the canvas stays readable.
 */
export async function renderSketchJpeg(imageUrl: string, marks: SketchMark[]): Promise<Blob> {
  const response = await fetch(imageUrl, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob())
  await document.fonts?.load(`600 32px ${HAND_FONT}`).catch(() => undefined)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  drawMarks(ctx, marks, bitmap.width, bitmap.height)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/jpeg', 0.9))
}

export function drawMarks(ctx: CanvasRenderingContext2D, marks: SketchMark[], w: number, h: number) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const mark of marks) {
    ctx.save()
    ctx.shadowColor = haloFor(mark.color)
    ctx.shadowBlur = w * 0.004
    if (mark.type === 'line') {
      ctx.strokeStyle = mark.color
      ctx.lineWidth = mark.width * w
      ctx.stroke(new Path2D(linePath(mark.points, w, h)))
    } else {
      ctx.font = `600 ${mark.size * w}px ${HAND_FONT}`
      ctx.fillStyle = mark.color
      ctx.fillText(mark.text, mark.x * w, mark.y * h)
    }
    ctx.restore()
  }
}

/** Box of a mark (left, top, right, bottom in frame units), for the selection. */
export function markBounds(mark: SketchMark, aspect: number): [number, number, number, number] {
  if (mark.type === 'text') return textBox(mark, aspect)
  const xs = mark.points.map((p) => p[0])
  const ys = mark.points.map((p) => p[1])
  const padX = mark.width / 2
  const padY = (mark.width * aspect) / 2
  return [Math.min(...xs) - padX, Math.min(...ys) - padY, Math.max(...xs) + padX, Math.max(...ys) + padY]
}

/** Indices of the marks whose box meets the rectangle between two points. */
export function marksInRect(marks: SketchMark[], a: [number, number], b: [number, number], aspect: number): number[] {
  const [left, right] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
  const [top, bottom] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
  return marks.flatMap((mark, index) => {
    const [l, t, r, bt] = markBounds(mark, aspect)
    return l <= right && r >= left && t <= bottom && bt >= top ? [index] : []
  })
}

const clampCoord = (value: number) => Math.round(Math.min(1.1, Math.max(-0.1, value)) * 10000) / 10000

/** The mark moved by dx, dy (frame units), kept within what the server accepts. */
export function moveMark(mark: SketchMark, dx: number, dy: number): SketchMark {
  if (mark.type === 'text') return { ...mark, x: clampCoord(mark.x + dx), y: clampCoord(mark.y + dy) }
  return { ...mark, points: mark.points.map(([x, y]) => [clampCoord(x + dx), clampCoord(y + dy)] as [number, number]) }
}
