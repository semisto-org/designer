/**
 * Pure geometry of the « Plan directeur » page (no browser, unit-tested):
 * the map frame, the side column (landscape) or the foot band (portrait)
 * where the mission, the numbered legend and the title block go, and the
 * size factor that keeps lettering readable from A3 to A0.
 */
export type MasterPaper = 'A4' | 'A3' | 'A2' | 'A1' | 'A0'
export type MasterOrientation = 'portrait' | 'landscape'
type Box = { x: number; y: number; w: number; h: number }

const PAPER: Record<MasterPaper, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] }

export type MasterLayout = {
  width: number
  height: number
  /** Lettering and marks grow with the sheet: 1 on A3. */
  k: number
  frame: Box
  /** Where the mission and the legend flow, in `columns` columns. */
  text: Box
  columns: number
  /** The title block, at the foot of the text area. */
  cartouche: Box
}

export function masterLayout(paper: MasterPaper, orientation: MasterOrientation): MasterLayout {
  const [short, long] = PAPER[paper]
  const [width, height] = orientation === 'portrait' ? [short, long] : [long, short]
  const k = short / 297
  const margin = 10 * k
  const gap = 6 * k
  const cartoucheH = 46 * k
  if (orientation === 'landscape') {
    const columnW = Math.max(width * 0.27, 80 * k)
    const frame = { x: margin, y: margin, w: width - 2 * margin - gap - columnW, h: height - 2 * margin }
    const x = frame.x + frame.w + gap
    const cartouche = { x, y: height - margin - cartoucheH, w: columnW, h: cartoucheH }
    return { width, height, k, frame, text: { x, y: margin, w: columnW, h: cartouche.y - margin - gap / 2 }, columns: 1, cartouche }
  }
  const bandH = height * 0.3
  const frame = { x: margin, y: margin, w: width - 2 * margin, h: height - 2 * margin - gap - bandH }
  const y = frame.y + frame.h + gap
  const cartoucheW = Math.max(frame.w * 0.3, 70 * k)
  const cartouche = { x: width - margin - cartoucheW, y: y + bandH - cartoucheH, w: cartoucheW, h: cartoucheH }
  const textW = frame.w - cartoucheW - gap
  return { width, height, k, frame, text: { x: margin, y, w: textW, h: bandH }, columns: Math.max(1, Math.floor(textW / (75 * k))), cartouche }
}

/**
 * Moves the numbers that would sit on one another (mm on the page), in
 * reading order: a later one steps down, then right, until it is clear.
 */
export function spreadMarks(points: { x: number; y: number }[], radius: number): { x: number; y: number }[] {
  const placed: { x: number; y: number }[] = []
  const min = radius * 2.1
  for (const point of points) {
    let candidate = { ...point }
    for (let tries = 0; tries < 12 && placed.some((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < min); tries++) {
      const angle = (tries * Math.PI) / 3
      const ring = min * (1 + Math.floor(tries / 6) * 0.8)
      candidate = { x: point.x + Math.cos(angle) * ring, y: point.y + Math.sin(angle) * ring }
    }
    placed.push(candidate)
  }
  return placed
}
