import { Download, Spline } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { HelpButton } from '@/components/help/HelpButton'
import { api } from '@/lib/api'
import { formatLength, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { SECTION_COLORS } from './colors'
import { showSectionLine } from './layer'
import { SectionDrawing } from './SectionDrawing'
import {
  canopyShare, crownOverWater, groundDrop, lineParam, parseLineParam, SECTION_MOMENTS, tallestAt,
  type SectionData, type SectionMoment,
} from './section'

export const SECTION_HELP_SLUG = 'la-coupe-dans-le-temps'
const CORRIDORS = [2, 4, 6, 10, 15, 30]
const HEIGHT = 300

/** The time strip's moment, as the section reads it (the land on arrival is today's section). */
const sectionMoment = (moment: string): SectionMoment => (SECTION_MOMENTS as readonly string[]).includes(moment) ? (moment as SectionMoment) : 'today'

/**
 * « Coupe dans le temps »: the person draws a line across the land and
 * Terranova cuts it as a designer does on the board, the ground, the water,
 * the paths and every plant at its size. The section follows the time strip:
 * choosing « An 15 » here grows the map too, and the other way round.
 */
export default function SectionPanel() {
  const editor = useEditor()
  const map = editor.instance
  // An editor link (the MCP's get_section) brings its line.
  const [line, setLine] = useState<[number, number][] | null>(() => parseLineParam(new URLSearchParams(window.location.search).get('line')))
  const [corridor, setCorridor] = useState(() => {
    const asked = Number(new URLSearchParams(window.location.search).get('corridor'))
    return CORRIDORS.includes(asked) ? asked : 6
  })
  const [data, setData] = useState<SectionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  const moment = sectionMoment(editor.moment)
  // On a wide screen the drawing starts right of the panel, so both stay readable.
  const rootRef = useRef<HTMLDivElement>(null)
  const [sheetLeft, setSheetLeft] = useState<number | null>(null)
  useEffect(() => {
    const place = () => {
      const panel = rootRef.current?.closest('[data-editor-panel]') ?? rootRef.current
      const right = panel?.getBoundingClientRect().right ?? 0
      setSheetLeft(window.innerWidth >= 768 && right > 0 ? Math.round(right + 12) : null)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [data])

  useEffect(() => {
    showSectionLine(map, line, corridor)
    return () => showSectionLine(map, null)
  }, [map, line, corridor])

  useEffect(() => {
    if (!line) return
    const controller = new AbortController()
    setLoading(true)
    api<SectionData>(`/maps/${editor.map.id}/design/section?line=${encodeURIComponent(lineParam(line))}&corridor=${corridor}`, { signal: controller.signal })
      .then(setData)
      .catch((error: Error) => { if (!controller.signal.aborted) editor.notify(error.message, 'error') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [line, corridor, editor.map.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The drawing takes the width it is given, from a phone to a wide screen.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.round(entry.contentRect.width))))
    observer.observe(box)
    return () => observer.disconnect()
  }, [data])

  async function draw() {
    setDrawing(true)
    try {
      const geometry = await editor.draw('linestring', { color: SECTION_COLORS.line })
      if (geometry?.type === 'LineString' && geometry.coordinates.length >= 2) {
        setLine(geometry.coordinates.map(([lng, lat]) => [lng, lat] as [number, number]))
      }
    } finally {
      setDrawing(false)
    }
  }

  const reading = useMemo(() => (data ? readSection(data, moment) : []), [data, moment])

  function download() {
    const svg = svgRef.current
    if (!svg) return
    const source = new XMLSerializer().serializeToString(svg)
    const image = new Image()
    const scale = 2
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = svg.viewBox.baseVal.width * scale
      canvas.height = svg.viewBox.baseVal.height * scale
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const link = document.createElement('a')
      link.download = `${t('section.file')}-${t(`section.moments.${moment}`).toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  }

  const sheet = data && (
    <div
      className="fixed inset-x-2 bottom-24 z-40 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-loam-200 backdrop-blur md:right-4"
      style={sheetLeft != null ? { left: sheetLeft } : undefined}
      role="region"
      aria-label={t('section.panel_title')}
    >
      {/* The moment on the drawing itself: the section and the map grow together. */}
      <div className="mb-2 flex justify-end">
        <Segmented
          label={t('section.moment')}
          value={moment}
          onChange={(next) => editor.setMoment(next)}
          options={SECTION_MOMENTS.map((m) => ({ value: m, label: t(`section.moments.${m}`) }))}
        />
      </div>
      <div ref={boxRef} className="w-full">
        <SectionDrawing ref={svgRef} data={data} moment={moment} width={width} height={HEIGHT} />
      </div>
    </div>
  )

  return (
    <div ref={rootRef} className="space-y-4">
      <p className="text-sm text-loam-600">{t('section.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void draw()} disabled={drawing}>
          <Spline className="h-4 w-4" />
          {line ? t('section.redraw') : t('section.draw')}
        </Button>
        <HelpButton slug={SECTION_HELP_SLUG} compact />
      </div>
      {drawing && <p className="text-sm text-loam-500">{t('section.drawing_hint')}</p>}

      {line && (
        <>
          <Field label={t('section.corridor')}>
            <Select value={String(corridor)} onChange={(e) => setCorridor(Number(e.target.value))}>
              {CORRIDORS.map((c) => <option key={c} value={c}>{t('section.corridor_value', { value: c })}</option>)}
            </Select>
          </Field>
        </>
      )}

      {loading && <p className="text-sm text-loam-500">{t('section.loading')}</p>}

      {data && (
        <section className="space-y-2 rounded-2xl bg-loam-50 p-4">
          <h3 className="font-serif text-lg text-loam-900">{t('section.reading_title')}</h3>
          <p className="text-sm text-loam-600">
            {t('section.length', { length: formatLength(data.lengthM) })}
            {groundDrop(data) != null && Math.abs(groundDrop(data) as number) >= 0.5 && ` · ${t('section.drop', { drop: formatNumber(Math.abs(Math.round((groundDrop(data) as number) * 10) / 10)) })}`}
          </p>
          {data.plants.length === 0
            ? <p className="text-sm text-loam-700">{t('section.empty', { corridor })}</p>
            : <ul className="list-disc space-y-1 pl-5 text-sm text-loam-800">{reading.map((r) => <li key={r}>{r}</li>)}</ul>}
          {data.relief === 'flat' && <p className="text-sm text-humus-800">{t('section.flat')}</p>}
          <p className="text-sm text-loam-500">{t('section.adult_ghost')}</p>
          <Button variant="secondary" onClick={download}>
            <Download className="h-4 w-4" />
            {t('section.download')}
          </Button>
        </section>
      )}
      {sheet && createPortal(sheet, document.body)}
    </div>
  )
}

/** What the section says at that moment, in a few sentences. */
export function readSection(data: SectionData, moment: SectionMoment): string[] {
  const info = data.moments.find((m) => m.key === moment)
  const year = info?.year ?? info?.calendarYear ?? ''
  const lines: string[] = []
  if (data.plants.length) {
    const share = Math.round(canopyShare(data, moment) * 100)
    if (moment !== 'today') lines.push(t(share >= 60 ? 'section.reading.closes' : 'section.reading.open', { year, share }))
    const tallest = tallestAt(data, moment)
    const when = moment === 'today' ? t('section.reading.today') : t('section.reading.at_year', { year })
    if (tallest) lines.push(t('section.reading.tallest', { name: tallest.plant.name ?? tallest.plant.code ?? '', height: formatNumber(Math.round(tallest.h * 10) / 10), when }))
    const over = crownOverWater(data, moment)
    if (over) lines.push(t('section.reading.over', { name: over.plant.name ?? over.plant.code ?? '', crossing: (over.crossing.name ?? t(`editor.kinds.${over.crossing.kind}`)).toLowerCase(), when }))
  }
  const drop = groundDrop(data)
  if (drop != null && Math.abs(drop) >= 1) lines.push(t('section.reading.slope', { side: t(drop > 0 ? 'section.reading.side_end' : 'section.reading.side_start') }))
  return lines
}
