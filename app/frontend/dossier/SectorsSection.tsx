import type { LineString, Position } from 'geojson'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import {
  arcLength, arcPath, farthestM, isSectorType, labelReversed, normalize, packRings, SECTOR_COLORS, sectorDirections, sectorLayout, sunSectors, sweep, toPixels,
  type SectorType, type SunSectorType,
} from '@/map/sectors/sectors'
import { rangeText } from '@/map/sectors/labels'
import { renderAerial } from '@/dossier/snapshot'
import type { Dossier } from '@/types/dossier'

// The picture beside the sidebar on an A4 landscape page (297 × 210 mm),
// in CSS pixels at 96 px/inch: 73 % of 1123 × 794.
const WIDTH = 820
const HEIGHT = 794

type Arc = { key: string; type: SectorType | SunSectorType; label: string; named: boolean; from: number; to: number; notes: string | null }

/** The arcs of the page: the sun from the latitude, then the sectors drawn in the editor. */
export function sectorArcs(cover: Dossier['cover'], center: Position): Arc[] {
  const sun = sunSectors(center[1]).map((s) => ({ key: s.type, type: s.type, label: t(`sectors.page.${s.type}`), named: true, from: s.from, to: s.to, notes: null }))
  const drawn = cover.features.features.flatMap((f): Arc[] => {
    if (f.properties.kind !== 'sector' || f.geometry.type !== 'LineString') return []
    const range = sectorDirections(f.properties, f.geometry as LineString, center)
    if (!range) return []
    const type = isSectorType(f.properties.sector_type) ? f.properties.sector_type : 'other'
    const name = f.properties.name?.trim()
    return [{
      key: String(f.properties.id), type, from: range.from, to: range.to, notes: f.properties.notes?.trim() || null,
      label: name || t(`drawing.options.sector_type.${type}`), named: Boolean(name),
    }]
  })
  return [...sun, ...drawn]
}

export function sectorCenter(cover: Dossier['cover']): Position | null {
  if (cover.center) return cover.center
  if (!cover.bbox) return null
  const [w, s, e, n] = cover.bbox
  return [(w + e) / 2, (s + n) / 2]
}

/** The font size of a label along its arc, shrunk to fit, or null when it cannot fit. */
export function labelSize(text: string, r: number, from: number, to: number, stroke: number): number | null {
  const room = arcLength(r, from, to) * 0.86
  const size = Math.max(7, Math.min(stroke * 0.5, room / (text.length * 0.86)))
  return text.length * size * 0.6 > room ? null : size
}

/** Label along its arc: white capitals spaced out, centred on the stroke. */
function ArcLabel({ id, text, r, from, to, size }: { id: string; text: string; r: number; from: number; to: number; size: number }) {
  const upper = text.toLocaleUpperCase('fr')
  const reversed = labelReversed(from, to)
  return (
    <>
      <path id={id} d={arcPath(0, 0, r, from, to, reversed)} fill="none" />
      <text fill="#ffffff" fontSize={size} fontWeight={700} letterSpacing={size * 0.26} dominantBaseline="central" fontFamily="'Inter Variable', system-ui, sans-serif">
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{upper}</textPath>
      </text>
    </>
  )
}

/** The number of an arc whose name does not fit along it, white on its middle. */
function ArcNumber({ number, r, from, to, stroke }: { number: number; r: number; from: number; to: number; stroke: number }) {
  const mid = (normalize(from + sweep(from, to) / 2) * Math.PI) / 180
  return (
    <text x={r * Math.sin(mid)} y={-r * Math.cos(mid)} fill="#ffffff" fontSize={stroke * 0.55} fontWeight={700} textAnchor="middle" dominantBaseline="central">
      {number}
    </text>
  )
}

/** The colour of an arc in the column, with its number when its name is not written along it. */
function Swatch({ color, number }: { color: string; number?: number }) {
  return (
    <span
      className="mr-[0.6cqw] inline-flex h-[1.3cqw] min-w-[2.2cqw] -translate-y-[0.1cqw] items-center justify-center rounded-full px-[0.3cqw] align-middle text-[0.85cqw] font-bold leading-none text-white"
      style={{ background: color }}
      aria-hidden
    >
      {number}
    </span>
  )
}

/** Without notes, the column says which way the sector comes from, and its type when its name does not. */
function fallback(arc: Arc) {
  const range = rangeText(arc.from, arc.to)
  const sentence = arc.named ? `${t(`drawing.options.sector_type.${arc.type}`)}, ${range}` : range
  return `${sentence.charAt(0).toLocaleUpperCase('fr')}${sentence.slice(1)}.`
}

/** The compass rose of the page, white on the photo. */
function Rose() {
  return (
    <g>
      <circle r={20} fill="none" stroke="#ffffff" strokeWidth={1.2} opacity={0.9} />
      <path d="M 0 -18 L 4 0 L 0 18 L -4 0 Z" fill="#ffffff" />
      <path d="M -18 0 L 0 -4 L 18 0 L 0 4 Z" fill="#ffffff" opacity={0.75} />
      <path d="M 0 -18 L 4 0 L -4 0 Z" fill="#7a9a5b" />
      {[['N', 0, -27], ['S', 0, 31], ['E', 29, 4], ['O', -29, 4]].map(([letter, x, y]) => (
        <text key={letter as string} x={x as number} y={y as number} textAnchor="middle" fill="#ffffff" fontSize={10} fontWeight={700}>{letter}</text>
      ))}
    </g>
  )
}

/** A white scale bar with its length. */
function ScaleBar({ metersPerPx }: { metersPerPx: number }) {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  const meters = steps.filter((m) => m / metersPerPx <= WIDTH * 0.18).pop() ?? steps[0]
  const px = meters / metersPerPx
  return (
    <g>
      <path d={`M 0 -5 V 0 H ${px} V -5 M ${px / 2} -3 V 0`} fill="none" stroke="#ffffff" strokeWidth={1.4} />
      <text x={0} y={-9} fill="#ffffff" fontSize={10} fontWeight={600}>0</text>
      <text x={px} y={-9} fill="#ffffff" fontSize={10} fontWeight={600} textAnchor="end">{`${meters} m`}</text>
    </g>
  )
}

/**
 * « Analyse des secteurs », on its own A4 landscape page like a permaculture
 * design report: a dark column of what each sector means for the design,
 * and the aerial photo with the terrain's outline and, around it, one arc
 * per sector, the sun's included, its name written along it.
 */
export function SectorsSection({ dossier, number }: { dossier: Dossier; number: number }) {
  const { cover } = dossier
  const center = sectorCenter(cover)
  const arcs = useMemo(() => (center ? sectorArcs(cover, center) : []), [cover, center?.[0], center?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const rings = useMemo(() => packRings(arcs), [arcs])
  const ringCount = rings.length ? Math.max(...rings) + 1 : 1
  const outline: Position[][] = useMemo(() => (cover.boundary?.coordinates ?? []).map((polygon) => polygon[0]), [cover.boundary])
  const terrainM = center ? farthestM(center, outline.flat().length ? outline.flat() : cover.bbox ? [[cover.bbox[0], cover.bbox[1]], [cover.bbox[2], cover.bbox[3]]] : []) : 0
  const layout = sectorLayout({ width: WIDTH, height: HEIGHT, rings: ringCount, terrainRadiusM: terrainM || 40 })
  const image = useAerial(cover, center, layout.metersPerPx)

  if (!center) return null
  const cx = WIDTH / 2
  const cy = HEIGHT / 2
  const outlinePath = outline.map((ring) => ring.map((p, i) => {
    const [x, y] = toPixels(center, p, layout.metersPerPx)
    return `${i === 0 ? 'M' : 'L'} ${(cx + x).toFixed(1)} ${(cy + y).toFixed(1)}`
  }).join(' ') + ' Z').join(' ')
  const sun = arcs.filter((a) => a.type === 'summer_sun' || a.type === 'winter_sun')
  const drawn = arcs.filter((a) => a.type !== 'summer_sun' && a.type !== 'winter_sun')
  // A name too long for its arc gives way to a number, repeated in the column, so no arc is left anonymous.
  const sizes = arcs.map((arc, i) => labelSize(arc.label.toLocaleUpperCase('fr'), layout.radius(rings[i]), arc.from, arc.to, layout.stroke))
  const numbers = new Map<string, number>()
  arcs.forEach((arc, i) => { if (sizes[i] == null) numbers.set(arc.key, numbers.size + 1) })

  return (
    <section
      id="dossier-sectors"
      aria-labelledby="dossier-sectors-title"
      className="dossier-sectors dossier-section mt-10 overflow-hidden rounded-lg ring-1 ring-loam-200 print:mt-0 print:rounded-none print:ring-0"
    >
      <div className="dossier-sectors-page grid grid-cols-[27fr_73fr] bg-[#26282b]" style={{ containerType: 'inline-size', aspectRatio: '297 / 210' }}>
        <div className="flex min-h-0 flex-col overflow-hidden px-[3.2cqw] py-[3.4cqw] text-[1.1cqw] leading-[1.45] text-white/85">
          <p className="text-[1.05cqw] font-semibold tabular-nums tracking-[0.2em] text-[#9cc27a]">{String(number).padStart(2, '0')}</p>
          <h2 id="dossier-sectors-title" className="mt-[0.6cqw] font-sans text-[2.5cqw] font-light uppercase leading-[1.1] tracking-[0.06em] text-white">
            {t('sectors.page.title')}
          </h2>
          <span className="mt-[1cqw] block h-[0.25cqw] w-[4cqw] bg-[#9cc27a]" aria-hidden />
          <dl className="mt-[2.2cqw] space-y-[1.2cqw]">
            {sun.length > 0 && (
              <div>
                <dt className="inline font-bold text-white">{sun.map((s) => <Swatch key={s.key} color={SECTOR_COLORS[s.type]} number={numbers.get(s.key)} />)}{t('sectors.page.sun_title')}{' '}: </dt>
                <dd className="inline">
                  {sun.map((s, i) => (
                    <Fragment key={s.key}>{i > 0 && ' ; '}{t(`sectors.page.sun_${s.type}`, { range: rangeText(s.from, s.to) })}</Fragment>
                  ))}.
                </dd>
              </div>
            )}
            {drawn.map((arc) => (
              <div key={arc.key}>
                <dt className="font-bold text-white"><Swatch color={SECTOR_COLORS[arc.type]} number={numbers.get(arc.key)} />{arc.label}{' '}:</dt>
                <dd>{arc.notes ?? fallback(arc)}</dd>
              </div>
            ))}
          </dl>
          {drawn.length === 0 && <p className="mt-[1.2cqw] text-white/60 print:hidden">{t('sectors.page.none')}</p>}
        </div>

        <div className="relative min-h-0 bg-[#3b4a33]">
          {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0 h-full w-full" role="img" aria-label={t('sectors.page.figure')}>
            {outlinePath && <path d={outlinePath} fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinejoin="round" />}
            <g transform={`translate(${cx} ${cy})`}>
              {arcs.map((arc, i) => {
                const r = layout.radius(rings[i])
                return (
                  <g key={arc.key}>
                    <path d={arcPath(0, 0, r, arc.from, arc.to)} fill="none" stroke={SECTOR_COLORS[arc.type]} strokeWidth={layout.stroke} strokeLinecap="round" />
                    {sizes[i] != null
                      ? <ArcLabel id={`sector-label-${arc.key}`} text={arc.label} r={r} from={arc.from} to={arc.to} size={sizes[i]} />
                      : <ArcNumber number={numbers.get(arc.key) ?? 0} r={r} from={arc.from} to={arc.to} stroke={layout.stroke} />}
                  </g>
                )
              })}
            </g>
            <g transform={`translate(${WIDTH - 48} 52)`}><Rose /></g>
            <g transform={`translate(${WIDTH - 40 - (WIDTH * 0.18)} ${HEIGHT - 24})`}><ScaleBar metersPerPx={layout.metersPerPx} /></g>
          </svg>
        </div>
      </div>
    </section>
  )
}

function useAerial(cover: Dossier['cover'], center: Position | null, metersPerPx: number): string | null {
  const [image, setImage] = useState<string | null>(null)
  const key = center ? `${center[0]}:${center[1]}:${metersPerPx.toFixed(4)}:${cover.base?.key ?? ''}` : ''
  useEffect(() => {
    if (!center) return
    let alive = true
    renderAerial(cover, { width: WIDTH, height: HEIGHT, center: center as [number, number], metersPerPx })
      .then((url) => { if (alive) setImage(url) })
      .catch(() => { if (alive) setImage(null) })
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return image
}
