import type { jsPDF as JsPDF } from 'jspdf'
import { formatNumber, t } from '@/lib/i18n'
import { PAPER_MM, pdfText, type Orientation, type Paper } from '@/map/drawing/pdf'
import { speciesCount, type PlantListRow } from '@/map/drawing/plantList'
import { inkOn, STRATA_COLORS } from '@/map/plants/strataColors'

const INK = '#1b1712'
const BODY = '#332d25'
const MUTED = '#6e6355'
const RULE = '#d9d0c1'
const ZEBRA = '#f7f3ec'

type ColumnKey = 'name' | 'variety' | 'latin' | 'strata' | 'state' | 'detail'

/** Column widths, as shares of the text width after the number column. */
const COLUMNS: { key: ColumnKey; share: number }[] = [
  { key: 'name', share: 0.25 },
  { key: 'variety', share: 0.2 },
  { key: 'latin', share: 0.22 },
  { key: 'strata', share: 0.15 },
  { key: 'state', share: 0.18 },
]

/** With detail sheets: a narrow « Détail » column says on which one each plant of a crowded bed reads. */
const COLUMNS_WITH_DETAIL: { key: ColumnKey; share: number }[] = [
  { key: 'name', share: 0.23 },
  { key: 'variety', share: 0.18 },
  { key: 'latin', share: 0.2 },
  { key: 'strata', share: 0.14 },
  { key: 'state', share: 0.17 },
  { key: 'detail', share: 0.08 },
]

function cell(row: PlantListRow, key: ColumnKey, details: ReadonlyMap<number, string>): string {
  switch (key) {
    case 'detail': return details.get(row.featureId) ?? ''
    case 'name': return row.name || t('drawing.pdf.plant_list.unknown')
    case 'variety': return row.variety ?? ''
    case 'latin': return row.latinName ?? ''
    case 'strata': return row.strata ? t(`plants.strata.${row.strata}`) : ''
    case 'state':
      if (!row.planted) return t('drawing.pdf.plant_list.to_plant')
      return row.plantedYear ? t('drawing.pdf.plant_list.planted_in', { year: row.plantedYear }) : t('drawing.pdf.plant_list.planted')
  }
}

/** The first line of `text` that fits in `width`, cut with dots when it does not. */
function fit(doc: JsPDF, text: string, width: number): string {
  const clean = pdfText(text)
  if (doc.getTextWidth(clean) <= width) return clean
  let cut = clean
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}...`
}

/**
 * « Liste des plantes »: the annex that follows the plan, on pages of the
 * same paper, one line per numbered plant (number on its strata colour, as
 * on the map, then name, variety, latin name, strata and whether it is in
 * the ground), so the numbers on the plan can be read in the field.
 */
export function drawPlantList(doc: JsPDF, rows: PlantListRow[], input: { title: string; paper: Paper; orientation: Orientation; details?: ReadonlyMap<number, string> }) {
  if (rows.length === 0) return
  const details = input.details ?? new Map<number, string>()
  const columns = rows.some((row) => details.has(row.featureId)) ? COLUMNS_WITH_DETAIL : COLUMNS
  const [short, long] = PAPER_MM[input.paper]
  const [width, height] = input.orientation === 'portrait' ? [short, long] : [long, short]
  const big = input.paper !== 'A4'
  const margin = big ? 18 : 15
  const base = big ? 10.5 : 9
  const rowHeight = big ? 7 : 6
  const textWidth = width - 2 * margin
  const numberWidth = big ? 16 : 14
  const restWidth = textWidth - numberWidth
  const headerTop = margin
  const tableTop = headerTop + (big ? 22 : 19)
  const footerY = height - margin + 4
  const perPage = Math.max(1, Math.floor((footerY - 8 - tableTop - rowHeight) / rowHeight))
  const pages = Math.ceil(rows.length / perPage)
  const species = speciesCount(rows)
  const subtitle = [
    t('drawing.pdf.plant_list.plants', { count: rows.length, plants: formatNumber(rows.length) }),
    species > 0 ? t('drawing.pdf.plant_list.species', { count: species, species: formatNumber(species) }) : null,
  ].filter(Boolean).join(', ')

  for (let page = 0; page < pages; page++) {
    doc.addPage(input.paper.toLowerCase(), input.orientation)
    // Heading: what this list is, and for which plan.
    doc.setTextColor(INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(big ? 18 : 15)
    doc.text(pdfText(t('drawing.pdf.plant_list.title')), margin, headerTop + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(base)
    doc.setTextColor(BODY)
    doc.text(fit(doc, `${input.title} · ${subtitle}`, textWidth), margin, headerTop + (big ? 12 : 10.5))

    // Column heads.
    let x = margin + numberWidth
    const headY = tableTop
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(base - 0.5)
    doc.setTextColor(MUTED)
    doc.text(pdfText(t('drawing.pdf.plant_list.number')), margin + numberWidth / 2 - 1, headY, { align: 'center' })
    for (const column of columns) {
      doc.text(pdfText(t(`drawing.pdf.plant_list.columns.${column.key}`)), x, headY)
      x += restWidth * column.share
    }
    doc.setDrawColor(RULE)
    doc.setLineWidth(0.3)
    doc.line(margin, headY + 2, margin + textWidth, headY + 2)

    // One line per plant.
    doc.setFontSize(base)
    rows.slice(page * perPage, (page + 1) * perPage).forEach((row, i) => {
      const top = headY + 2 + i * rowHeight
      const baseline = top + rowHeight / 2 + base * 0.13
      if (i % 2 === 1) {
        doc.setFillColor(ZEBRA)
        doc.rect(margin, top, textWidth, rowHeight, 'F')
      }
      // The number on its strata colour, as the dot on the map.
      const color = row.strata ? STRATA_COLORS[row.strata] : '#3d7d42'
      const label = String(row.number)
      doc.setFont('helvetica', 'bold')
      const discWidth = Math.max(rowHeight - 1.2, doc.getTextWidth(label) + 2.4)
      doc.setFillColor(color)
      doc.roundedRect(margin + numberWidth / 2 - 1 - discWidth / 2, top + 0.6, discWidth, rowHeight - 1.2, (rowHeight - 1.2) / 2, (rowHeight - 1.2) / 2, 'F')
      doc.setTextColor(inkOn(color))
      doc.text(label, margin + numberWidth / 2 - 1, baseline, { align: 'center' })

      let cx = margin + numberWidth
      for (const column of columns) {
        const w = restWidth * column.share
        doc.setFont('helvetica', column.key === 'name' || column.key === 'detail' ? 'bold' : 'normal')
        doc.setTextColor(column.key === 'latin' || column.key === 'state' ? MUTED : BODY)
        doc.text(fit(doc, cell(row, column.key, details), w - 2), cx, baseline)
        cx += w
      }
    })

    // Footer: where it comes from and which page.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(big ? 8 : 7)
    doc.setTextColor(MUTED)
    doc.text(pdfText(t('drawing.pdf.made_with')), margin, footerY)
    if (pages > 1) doc.text(pdfText(t('drawing.pdf.plant_list.page', { page: page + 1, pages })), margin + textWidth, footerY, { align: 'right' })
  }
}
