import type { jsPDF as JsPDF } from 'jspdf'
import type { Map as MapLibreMap } from 'maplibre-gl'
import qrcode from 'qrcode-generator'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { drawNorthArrow, drawScaleBar, mmToCss, pdfText, renderMap, slug } from '@/map/drawing/pdf'
import { masterLayout, spreadMarks, type MasterLayout, type MasterOrientation, type MasterPaper } from '@/map/drawing/masterPlanLayout'

/** GET /maps/:id/design/master_plan (MasterPlan#as_json). */
export type MasterPlanData = {
  title: string
  place?: string
  phase: string
  mission?: string
  areaM2?: number | null
  themes: { key: string; items: { number: number; id: number; label: string; kind: string; at?: [number, number] }[] }[]
  palette: { species_id: number; name: string; latin: string; code?: string; count: number }[]
  /** Each single plant, where it stands, with its species' code. */
  plants?: { id: number; code: string; at: [number, number] }[]
  /** What already stands and has a name, lettered A, B, C… */
  existing?: { letter: string; id: number; label: string; kind: string; at?: [number, number] }[]
  /** This garden's own time: the first fruits, the trees grown, the tallest one. */
  time?: { year: number; key: 'fruit' | 'adult' | 'tallest'; names: string[]; heightM?: number }[]
}

export type MasterInput = {
  title: string
  paper: MasterPaper
  orientation: MasterOrientation
  scale: number
  center: [number, number]
  hiddenLayers: string[]
  hiddenKinds?: string[]
  hiddenIds?: number[]
  tag?: string | null
  hideBoundary?: boolean
  variant?: number | null
  author: string | null
  sources: string[]
  /** The live map, behind the QR code. */
  url: string
  /** « Plan » (the plan look as drawn) or « Aquarelle » (that same plan, painted). */
  look?: MasterLook
  /**
   * Sets the editor's map at a moment of the time strip and resolves once
   * its crowns have grown or shrunk: given, a second sheet shows the garden
   * at year 5 and year 30 side by side.
   */
  atMoment?: (moment: GrowthMoment) => Promise<void>
}

export type MasterLook = 'plan' | 'watercolor'
export type GrowthMoment = 'year5' | 'year30'
const GROWTH_MOMENTS: { moment: GrowthMoment; year: number }[] = [{ moment: 'year5', year: 5 }, { moment: 'year30', year: 30 }]

// Theme inks, in Semisto's design order (water before plants).
const THEME_COLORS: Record<string, string> = {
  water: '#3f6f8a', access: '#a06a2c', structures: '#6b5a48', animals: '#9c4a2e', drawings: '#5b5781', plants: '#4f6b2a',
}
const INK = '#1b1712'
const SOFT = '#4d4a45'
const FAINT = '#7a756c'

/**
 * « Plan directeur »: the project as a designer hands it over. The map in
 * the plan look, every element numbered in the ink of its theme; beside it
 * (or below, in portrait) the mission, the legend theme by theme, the
 * palette, a word on time, and the title block with the phase, the scale,
 * the north and a QR code to the living map. Resolves with the file name.
 */
export async function exportMasterPlan(source: MapLibreMap, input: MasterInput, plan: MasterPlanData, onProgress?: (step: 'map' | 'paint' | 'pdf', page?: number, pages?: number) => void): Promise<string> {
  const layout = masterLayout(input.paper, input.orientation)
  const items = plan.themes.flatMap((theme) => theme.items.map((item) => ({ ...item, theme: theme.key })))
  let marks: { x: number; y: number; number: number; theme: string }[] = []
  let codes: { x: number; y: number; code: string }[] = []
  let letters: { x: number; y: number; letter: string }[] = []
  const pages = input.atMoment ? 2 : 1
  onProgress?.('map', 1, pages)
  const image = await renderMap(source, {
    center: input.center, scale: input.scale, frame: layout.frame, hiddenLayers: input.hiddenLayers,
    variant: input.variant, hideBoundary: input.hideBoundary, planLook: true, tag: input.tag, hiddenIds: input.hiddenIds,
    paintOnly: input.look === 'watercolor',
    // The bubbles were the sketch of the intentions: the master plan shows what came of them.
    hiddenKinds: [...(input.hiddenKinds ?? []), 'bubble'],
    inspect: (map) => {
      const widthCss = mmToCss(layout.frame.w)
      const ratio = layout.frame.w / widthCss
      marks = items.flatMap((item) => {
        if (!item.at) return []
        const p = map.project(item.at)
        const x = layout.frame.x + p.x * ratio
        const y = layout.frame.y + p.y * ratio
        const inside = x > layout.frame.x + 3 && x < layout.frame.x + layout.frame.w - 3 && y > layout.frame.y + 3 && y < layout.frame.y + layout.frame.h - 3
        return inside ? [{ x, y, number: item.number, theme: item.theme }] : []
      })
      const place = (at: [number, number]) => {
        const p = map.project(at)
        const x = layout.frame.x + p.x * ratio
        const y = layout.frame.y + p.y * ratio
        return x > layout.frame.x + 3 && x < layout.frame.x + layout.frame.w - 3 && y > layout.frame.y + 3 && y < layout.frame.y + layout.frame.h - 3 ? { x, y } : null
      }
      codes = (plan.plants ?? []).flatMap((plant) => { const at = place(plant.at); return at ? [{ ...at, code: plant.code }] : [] })
      letters = (plan.existing ?? []).flatMap((item) => { const at = item.at && place(item.at); return at ? [{ ...at, letter: item.letter }] : [] })
    },
  })
  let painted = image
  if (input.look === 'watercolor') {
    // The same plan, painted: nothing is added, the numbers and the legend stay crisp on top.
    onProgress?.('paint')
    const { seedOf, watercolorDataUrl } = await import('@/map/drawing/watercolor')
    painted = await watercolorDataUrl(image, layout.frame.w, seedOf(`${input.url}|${input.title}`))
  }
  onProgress?.('pdf')
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: input.orientation, unit: 'mm', format: input.paper.toLowerCase(), compress: true })
  doc.setProperties({ title: pdfText(input.title), creator: 'Semisto Terranova', author: pdfText(input.author ?? '') })

  // Paper, map and frame.
  doc.setFillColor('#fbf7ee')
  doc.rect(0, 0, layout.width, layout.height, 'F')
  const { frame, k } = layout
  doc.addImage(painted, 'JPEG', frame.x, frame.y, frame.w, frame.h, undefined, 'FAST')
  doc.setDrawColor(INK)
  doc.setLineWidth(0.35 * k)
  doc.rect(frame.x, frame.y, frame.w, frame.h, 'S')
  drawCodes(doc, codes, k)
  drawLetters(doc, letters, k)
  drawMarks(doc, marks, k)
  drawNorthArrow(doc, frame.x + frame.w - 11 * k, frame.y + 11 * k, k)
  drawSources(doc, layout, input.sources)

  drawText(doc, layout, input, plan)
  drawCartouche(doc, layout, input, plan)

  if (input.atMoment) {
    onProgress?.('map', 2, pages)
    await drawGrowthSheet(doc, source, input, plan, layout)
  }

  const fileName = `${slug(input.title) || 'plan'}-${slug(t('master_plan.file'))}-${input.paper.toLowerCase()}.pdf`
  doc.save(fileName)
  return fileName
}

/**
 * The second sheet: the same garden at year 5 and at year 30, side by side
 * (stacked in portrait), each plant with its code, and what each moment
 * brings in this garden. The crowns are the editor's growth model.
 */
async function drawGrowthSheet(doc: JsPDF, source: MapLibreMap, input: MasterInput, plan: MasterPlanData, layout: MasterLayout) {
  const { k, width, height } = layout
  const margin = 10 * k
  const gap = 6 * k
  const head = 16 * k
  const foot = 24 * k
  const landscape = input.orientation === 'landscape'
  const w = landscape ? (width - 2 * margin - gap) / 2 : width - 2 * margin
  const h = landscape ? height - 2 * margin - head - foot : (height - 2 * margin - head - 2 * foot - gap) / 2
  // The two frames show what the first sheet shows, smaller.
  const scale = Math.round(input.scale * Math.max(layout.frame.w / w, layout.frame.h / h))
  doc.addPage(input.paper.toLowerCase(), input.orientation)
  doc.setFillColor('#fbf7ee')
  doc.rect(0, 0, width, height, 'F')
  doc.setFont('times', 'bold')
  doc.setFontSize(18 * k)
  doc.setTextColor(INK)
  doc.text(pdfText(t('master_plan.growth_title')), margin, margin + 7 * k)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5 * k)
  doc.setTextColor(SOFT)
  doc.text(pdfText(t('master_plan.growth_hint', { title: input.title })), margin, margin + 12 * k)

  for (const [i, { moment, year }] of GROWTH_MOMENTS.entries()) {
    const frame = landscape
      ? { x: margin + i * (w + gap), y: margin + head, w, h }
      : { x: margin, y: margin + head + i * (h + foot + gap), w, h }
    await input.atMoment?.(moment)
    let codes: { x: number; y: number; code: string }[] = []
    const image = await renderMap(source, {
      center: input.center, scale, frame, hiddenLayers: input.hiddenLayers,
      variant: input.variant, hideBoundary: input.hideBoundary, planLook: true, tag: input.tag, hiddenIds: input.hiddenIds,
      paintOnly: input.look === 'watercolor',
      hiddenKinds: [...(input.hiddenKinds ?? []), 'bubble'],
      inspect: (map) => {
        const ratio = frame.w / mmToCss(frame.w)
        codes = (plan.plants ?? []).flatMap((plant) => {
          const p = map.project(plant.at)
          const x = frame.x + p.x * ratio
          const y = frame.y + p.y * ratio
          return x > frame.x + 3 && x < frame.x + frame.w - 3 && y > frame.y + 3 && y < frame.y + frame.h - 3 ? [{ x, y, code: plant.code }] : []
        })
      },
    })
    // Painted like the first sheet, so the two read as one set.
    const painted = input.look === 'watercolor'
      ? await import('@/map/drawing/watercolor').then(({ seedOf, watercolorDataUrl }) => watercolorDataUrl(image, frame.w, seedOf(`${input.url}|${input.title}|${year}`)))
      : image
    doc.addImage(painted, 'JPEG', frame.x, frame.y, frame.w, frame.h, undefined, 'FAST')
    doc.setDrawColor(INK)
    doc.setLineWidth(0.35 * k)
    doc.rect(frame.x, frame.y, frame.w, frame.h, 'S')
    drawCodes(doc, codes, k)
    // The year, like a label pinned on the sheet.
    doc.setFillColor('#fbf7ee')
    doc.roundedRect(frame.x + 3 * k, frame.y + 3 * k, 22 * k, 9 * k, 1.5 * k, 1.5 * k, 'F')
    doc.setFont('times', 'bold')
    doc.setFontSize(15 * k)
    doc.setTextColor('#5b5781')
    doc.text(pdfText(t('master_plan.growth_year', { year })), frame.x + 6 * k, frame.y + 10 * k)
    const said = timeText((plan.time ?? []).filter((step) => (year === 5 ? step.year <= 5 : step.year > 5)), false)
    if (said) {
      doc.setFont('times', 'normal')
      doc.setFontSize(9.5 * k)
      doc.setTextColor(SOFT)
      const lines: string[] = doc.splitTextToSize(pdfText(said), frame.w)
      doc.text(lines.slice(0, 3), frame.x, frame.y + frame.h + 5.5 * k)
    }
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5 * k)
  doc.setTextColor(FAINT)
  doc.text(pdfText(t('master_plan.growth_note', { scale: formatNumber(scale) })), margin, height - margin)
}

/** Each plant's species code, small, just beside it, as a designer writes it on a plan. */
function drawCodes(doc: JsPDF, codes: { x: number; y: number; code: string }[], k: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(4.6 * k)
  doc.setLineDashPattern([], 0)
  for (const { x, y, code } of codes) {
    const text = pdfText(code)
    const w = doc.getTextWidth(text) + 1.2 * k
    const h = 2.4 * k
    // On a slip of paper, so it reads on the darkest crown.
    doc.setFillColor('#fbf7ee')
    doc.roundedRect(x + 1 * k, y - h / 2, w, h, 0.6 * k, 0.6 * k, 'F')
    doc.setTextColor(THEME_COLORS.plants)
    doc.text(text, x + 1.6 * k, y + 0.6 * k)
  }
}

/** What already stands, lettered in grey: it was there before the project. */
function drawLetters(doc: JsPDF, letters: { x: number; y: number; letter: string }[], k: number) {
  const r = 2.1 * k
  const spread = spreadMarks(letters, r)
  doc.setLineDashPattern([], 0)
  letters.forEach(({ letter }, i) => {
    const { x, y } = spread[i]
    doc.setFillColor('#f2efe8')
    doc.setDrawColor(FAINT)
    doc.setLineWidth(0.3 * k)
    doc.circle(x, y, r, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6 * k)
    doc.setTextColor(SOFT)
    doc.text(letter, x, y + 0.75 * k, { align: 'center' })
  })
}

function drawMarks(doc: JsPDF, marks: { x: number; y: number; number: number; theme: string }[], k: number) {
  const r = 2.3 * k
  const spread = spreadMarks(marks, r)
  doc.setLineDashPattern([], 0)
  marks.forEach((mark, i) => {
    const { x, y } = spread[i]
    if (x !== mark.x || y !== mark.y) {
      doc.setDrawColor(THEME_COLORS[mark.theme] ?? INK)
      doc.setLineWidth(0.2 * k)
      doc.line(mark.x, mark.y, x, y)
    }
    doc.setFillColor('#ffffff')
    doc.setDrawColor(THEME_COLORS[mark.theme] ?? INK)
    doc.setLineWidth(0.45 * k)
    doc.circle(x, y, r, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize((mark.number > 99 ? 5.2 : 6.4) * k)
    doc.setTextColor(THEME_COLORS[mark.theme] ?? INK)
    doc.text(String(mark.number), x, y + 0.8 * k, { align: 'center' })
  })
}

function drawSources(doc: JsPDF, layout: MasterLayout, sources: string[]) {
  if (!sources.length) return
  const { frame, k } = layout
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5 * k)
  const lines: string[] = doc.splitTextToSize(pdfText(`${t('drawing.pdf.sources')} : ${sources.join(' · ')}`), frame.w * 0.6)
  const height = lines.length * 2.3 * k + 1.6 * k
  const width = Math.max(...lines.map((l) => doc.getTextWidth(l))) + 3 * k
  doc.setFillColor('#ffffff')
  doc.rect(frame.x + frame.w - width - 0.2, frame.y + frame.h - height - 0.2, width, height, 'F')
  doc.setTextColor(SOFT)
  doc.text(lines, frame.x + frame.w - width + 1.3 * k, frame.y + frame.h - height + 2.1 * k)
}

/** Writes lines in the text area, column after column; false once it is full. */
class Flow {
  column = 0
  y: number
  constructor(private doc: JsPDF, private layout: MasterLayout) {
    this.y = layout.text.y
  }

  get width() {
    const { text, columns, k } = this.layout
    return (text.w - (columns - 1) * 5 * k) / columns
  }

  get x() {
    return this.layout.text.x + this.column * (this.width + 5 * this.layout.k)
  }

  /** Room for `height` mm, moving to the next column if needed. */
  room(height: number): boolean {
    const bottom = this.layout.text.y + this.layout.text.h
    if (this.y + height <= bottom) return true
    if (this.column + 1 >= this.layout.columns) return false
    this.column += 1
    this.y = this.layout.text.y
    return true
  }

  lines(text: string, size: number, opts: { font?: 'helvetica' | 'times'; style?: 'normal' | 'bold'; color?: string; indent?: number; gap?: number } = {}): boolean {
    const { k } = this.layout
    this.doc.setFont(opts.font ?? 'helvetica', opts.style ?? 'normal')
    this.doc.setFontSize(size * k)
    this.doc.setTextColor(opts.color ?? INK)
    const indent = (opts.indent ?? 0) * k
    const wrapped: string[] = this.doc.splitTextToSize(pdfText(text), this.width - indent)
    const lineH = size * 0.42 * k
    for (const line of wrapped) {
      if (!this.room(lineH)) return false
      this.y += lineH
      this.doc.text(line, this.x + indent, this.y)
    }
    this.y += (opts.gap ?? 0) * k
    return true
  }

  space(mm: number) {
    this.y += mm * this.layout.k
  }
}

function drawText(doc: JsPDF, layout: MasterLayout, input: MasterInput, plan: MasterPlanData) {
  const flow = new Flow(doc, layout)
  const { k } = layout
  flow.lines(input.title, 20, { font: 'times', style: 'bold', gap: 1 })
  if (plan.place) flow.lines(plan.place, 8.5, { color: SOFT, gap: 1 })
  flow.lines(t('master_plan.phase', { phase: plan.phase }), 8.5, { color: SOFT, gap: 4 })

  if (plan.mission) {
    flow.lines(t('master_plan.mission'), 9, { style: 'bold', color: '#5b5781', gap: 0.5 })
    flow.lines(plan.mission, 10.5, { font: 'times', gap: 4 })
  }

  let full = false
  let left = plan.themes.reduce((sum, theme) => sum + theme.items.length, 0)
  for (const theme of plan.themes) {
    if (full) break
    if (!flow.room(10 * k)) { full = true; break }
    flow.space(1)
    const color = THEME_COLORS[theme.key] ?? INK
    doc.setFillColor(color)
    doc.circle(flow.x + 1.6 * k, flow.y + 2.2 * k, 1.4 * k, 'F')
    flow.lines(t(`master_plan.themes.${theme.key}`), 9.5, { style: 'bold', color, indent: 4.5, gap: 0.8 })
    for (const item of theme.items) {
      if (!flow.lines(`${item.number}. ${item.label}`, 8, { color: SOFT, indent: 4.5, gap: 0.3 })) { full = true; break }
      left -= 1
    }
  }
  if (full && left > 0) flow.lines(t('master_plan.more', { count: left }), 7.5, { color: FAINT })

  if (!full && plan.palette.length) {
    flow.space(3)
    flow.lines(t('master_plan.palette', { count: plan.palette.reduce((sum, row) => sum + row.count, 0) }), 9.5, { style: 'bold', color: THEME_COLORS.plants, gap: 0.8 })
    for (const row of plan.palette) {
      if (!flow.lines(`${row.code ? `${row.code} · ` : ''}${row.count} × ${row.name}`, 8, { color: SOFT, indent: 4.5, gap: 0.3 })) break
    }
  }

  if (!full && plan.existing?.length) {
    flow.space(3)
    flow.lines(t('master_plan.existing_title'), 9.5, { style: 'bold', color: SOFT, gap: 0.5 })
    flow.lines(t('master_plan.existing_hint'), 7.5, { color: FAINT, indent: 4.5, gap: 0.5 })
    for (const item of plan.existing) {
      if (!flow.lines(`${item.letter}. ${item.label}`, 8, { color: SOFT, indent: 4.5, gap: 0.3 })) break
    }
  }

  if (!full) {
    flow.space(3)
    flow.lines(t('master_plan.time_title'), 9, { style: 'bold', color: '#5b5781', gap: 0.5 })
    flow.lines(timeText(plan.time ?? []), 8, { font: 'times', color: SOFT })
  }
}

/** « Le temps du vivant », told with this garden's own plants when the palette allows it. */
export function timeText(time: NonNullable<MasterPlanData['time']>, withAdultSize = true): string {
  const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('master_plan.and')} ${names[names.length - 1]}` : names[0] ?? '')
  const told = time.map((step) => step.key === 'tallest'
    ? t('master_plan.time_tallest', { year: step.year, name: step.names[0], height: step.heightM ?? 0 })
    : t(`master_plan.time_${step.key}`, { year: step.year, names: list(step.names) }))
  if (!withAdultSize) return told.join(' ')
  return [t('master_plan.time_adult_size'), ...(told.length ? told : [t('master_plan.time')])].join(' ')
}

function drawCartouche(doc: JsPDF, layout: MasterLayout, input: MasterInput, plan: MasterPlanData) {
  const { cartouche: c, k } = layout
  doc.setLineDashPattern([], 0)
  doc.setDrawColor(INK)
  doc.setLineWidth(0.3 * k)
  doc.rect(c.x, c.y, c.w, c.h, 'S')
  const qrSize = c.h - 10 * k
  const qrX = c.x + c.w - qrSize - 4 * k
  drawQr(doc, input.url, qrX, c.y + 3 * k, qrSize)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5 * k)
  doc.setTextColor(FAINT)
  doc.text(pdfText(t('master_plan.qr')), qrX + qrSize / 2, c.y + c.h - 3 * k, { align: 'center' })

  const x = c.x + 4 * k
  let y = c.y + 6 * k
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10 * k)
  doc.setTextColor(INK)
  doc.text(pdfText(t('master_plan.heading')), x, y)
  y += 4.6 * k
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7 * k)
  doc.setTextColor(SOFT)
  const date = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long' }).format(new Date())
  const facts = [
    t('master_plan.phase', { phase: plan.phase }),
    `${t('drawing.pdf.date')} : ${date}`,
    input.author ? `${t('drawing.pdf.author')} : ${input.author}` : null,
    plan.areaM2 ? `${t('drawing.pdf.area')} : ${formatArea(plan.areaM2)}` : null,
    t('drawing.pdf.scale_label', { scale: formatNumber(input.scale) }) + ` · ${input.paper}`,
  ].filter((v): v is string => Boolean(v))
  const textW = qrX - x - 3 * k
  for (const fact of facts) {
    const line: string[] = doc.splitTextToSize(pdfText(fact), textW)
    doc.text(line[0] ?? '', x, y)
    y += 3.4 * k
  }
  drawScaleBar(doc, input.scale, x + 1 * k, c.y + c.h - 11 * k, Math.min(textW - 4 * k, 50 * k))
  doc.setFontSize(5.5 * k)
  doc.setTextColor(FAINT)
  doc.text(pdfText(t('drawing.pdf.made_with')), x, c.y + c.h - 2.5 * k)
}

function drawQr(doc: JsPDF, url: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  const count = qr.getModuleCount()
  const cell = size / (count + 2)
  doc.setFillColor('#ffffff')
  doc.rect(x, y, size, size, 'F')
  doc.setFillColor(INK)
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) doc.rect(x + (col + 1) * cell, y + (row + 1) * cell, cell, cell, 'F')
    }
  }
}
