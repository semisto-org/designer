// Sketches over a photo (PhotoSketch on the server, the same marks as the
// website's sketcher in app/frontend/map/photos/sketch/marks.ts). Marks
// live in the photo's frame: x and y from 0 to 1 of its width and height,
// sizes as fractions of its width, so a sketch drawn on a phone lands at
// the same place on the computer. Pure, so it is tested without a phone.

export type SketchLine = { type: 'line'; color: string; width: number; points: [number, number][] }
/** A handwritten note: its baseline starts at x, y; size is a fraction of the photo's width. */
export type SketchText = { type: 'text'; color: string; size: number; x: number; y: number; text: string }
export type SketchMark = SketchLine | SketchText

export type Sketch = {
  id: number
  photoId: number
  name: string
  strokes: SketchMark[]
  lockVersion: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** The website's inks (map/drawing/SketchTool.tsx): white and ink first, they read on any photo. */
export const INKS = ['#ffffff', '#1b1712', '#d64545', '#ef9b0d', '#ffd43b', '#1f6b46', '#2a6fdb', '#5b5781'] as const
export const LINE_WIDTHS = { fine: 0.003, medium: 0.006, bold: 0.012 } as const
export const TEXT_SIZES = { fine: 0.03, medium: 0.045, bold: 0.065 } as const
export type WidthKey = keyof typeof LINE_WIDTHS
export const WIDTH_KEYS = Object.keys(LINE_WIDTHS) as WidthKey[]

/** What the server accepts in one sketch (PhotoSketch). */
export const MAX_MARKS = 1000
export const MAX_POINTS = 20000
export const MAX_TEXT = 200

/** Light inks get a dark halo, dark inks a light one, so both read on any photo. */
export function haloFor(color: string): string {
  const n = parseInt(color.slice(1), 16)
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return luminance > 0.6 ? 'rgba(27, 23, 18, 0.55)' : 'rgba(255, 255, 255, 0.7)'
}

const round = (value: number) => Math.round(value * 10000) / 10000
const clamp = (value: number) => Math.min(1.1, Math.max(-0.1, value))

/** A finger on the drawing surface (w × h points) as a point of the photo's frame. */
export function toFrame(x: number, y: number, w: number, h: number): [number, number] {
  return [round(clamp(x / w)), round(clamp(y / h))]
}

/** Drops points closer than `min` to the previous one and rounds the rest (smaller payload, same line). */
export function simplify(points: [number, number][], min = 0.0015): [number, number][] {
  const kept: [number, number][] = []
  for (const [x, y] of points) {
    const last = kept[kept.length - 1]
    if (!last || Math.hypot(x - last[0], y - last[1]) >= min) kept.push([round(x), round(y)])
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

/** Approximate box of a note (left, top, right, bottom in frame units): handwriting is about half as wide as tall per letter. */
export function textBox(mark: SketchText, aspect: number): [number, number, number, number] {
  const width = mark.text.length * mark.size * 0.45
  const height = mark.size * aspect
  return [mark.x, mark.y - height * 0.8, mark.x + width, mark.y + height * 0.25]
}

/**
 * The index of the topmost mark under a finger (frame coordinates), for the
 * eraser, or -1. `aspect` is width / height of the photo: distances are in
 * units of its width. A finger is wider than a mouse, hence the tolerance.
 */
export function markAt(marks: SketchMark[], x: number, y: number, aspect: number, tolerance = 0.03): number {
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
      if (x >= left - tolerance && x <= right + tolerance && y >= top - tolerance && y <= bottom + tolerance) return i
    }
  }
  return -1
}

/** Whether one more mark still fits what the server takes. */
export function hasRoom(marks: SketchMark[], adding: SketchMark): boolean {
  const points = (list: SketchMark[]) => list.reduce((sum, m) => sum + (m.type === 'line' ? m.points.length : 0), 0)
  return marks.length + 1 <= MAX_MARKS && points(marks) + (adding.type === 'line' ? adding.points.length : 0) <= MAX_POINTS
}

/** A note as the server takes it, or null when there is nothing to write. */
export function noteMark(text: string, x: number, y: number, color: string, width: WidthKey): SketchText | null {
  const trimmed = text.trim().slice(0, MAX_TEXT)
  return trimmed ? { type: 'text', color, size: TEXT_SIZES[width], x: round(clamp(x)), y: round(clamp(y)), text: trimmed } : null
}
