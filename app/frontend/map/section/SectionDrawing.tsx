import { forwardRef, type ReactNode } from 'react'
import { formatNumber, t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strataColors'
import type { Strata } from '@/types/plants'
import { SECTION_COLORS as C, SECTION_WASHES as W } from './colors'
import {
  distanceTicks, groundPaths, isWaterCrossing, labelRows, midSentence, noonShadow, noonSunInSection, plantShape, sectionLayout, tallestAt,
  type SectionData, type SectionLayout, type SectionMoment, type SectionPlant,
} from './section'

const FONT = 'Inter, system-ui, sans-serif'
const SERIF = '"EB Garamond", Georgia, serif'
const TREES = new Set(['canopy', 'sub_canopy'])

/**
 * The section, drawn as a designer draws one on the board: the paper, the
 * ground and a slice of soil, the water dug into it with its berm, the
 * hedges at their height, every plant in the silhouette of its layer at its
 * size at the moment (its adult size dotted behind), its code and a key of
 * the codes, the noon sun of June and December grazing the tallest tree and
 * the shadow it casts, A and A′ at the ends, and the scale.
 */
export const SectionDrawing = forwardRef<SVGSVGElement, { data: SectionData; moment: SectionMoment; width: number; height: number }>(
  function SectionDrawing({ data, moment, width, height }, ref) {
    const layout = sectionLayout(data, width, height)
    const { line, soil } = groundPaths(data, layout)
    const { x, y, groundAt } = layout
    const corridor = Math.max(0.5, data.corridorM)
    // Far plants first, paler: the section looks through the band.
    const plants = [...data.plants].sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset))
    const showGhost = moment !== 'year30'
    const info = data.moments.find((m) => m.key === moment)
    const title = `${t('section.panel_title')} ${t('section.start')}–${t('section.end')} · ${t(`section.moments.${moment}`)}${info ? ` ${t('section.calendar_year', { year: info.calendarYear })}` : ''}`
    const small = width < 560
    const labelSize = small ? 11 : 11.5

    const named = data.crossings.filter((c) => !isWaterCrossing(c) || c.name)
    const labels = named.map((c) => {
      const text = c.name ?? t(`editor.kinds.${c.kind}`)
      const w = text.length * labelSize * 0.56 + 8
      // Kept on the sheet: a label at an end leans inwards.
      const at = Math.max(4 + w / 2, Math.min(width - 4 - w / 2, x((c.from + c.to) / 2)))
      return { c, text, x: at, tick: x((c.from + c.to) / 2), width: w }
    })
    const rows = labelRows(labels.map((l) => ({ x: l.x, width: l.width })), 4)
    const lat = data.line[0]?.[1] ?? 50
    const sun = noonSunInSection(data.bearing, lat)
    const tallest = tallestAt(data, moment)
    const shadowTree = tallest && TREES.has(tallest.plant.strata) && tallest.h >= 2 ? tallest : null
    const ticks = distanceTicks(data.lengthM, small ? 4 : 6)
    const floor = height - layout.bottom
    const barM = layout.sy * 10 > (height - layout.top - layout.bottom) * 0.6 ? 5 : 10
    // The key of the codes drawn, in the order along the line.
    const key = [...new Map(data.plants.filter((p) => p.code && p.sizes[moment]).sort((a, b) => a.d - b.d).map((p) => [p.code as string, midSentence(p)])).entries()]
    const keyText = key.map(([code, name]) => `${code} ${name}`).join(' · ')

    return (
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={title} style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
        <rect x={0} y={0} width={width} height={height} fill={C.paper} />
        <text x={layout.left} y={17} fontFamily={SERIF} fontSize={small ? 14 : 16} fontWeight={600} fill={C.ink}>{title}</text>

        {/* The soil, its topsoil, and the ground line. */}
        <path d={soil} fill={C.soil} opacity={0.55} />
        <path d={line} fill="none" stroke={C.topsoil} strokeWidth={6} opacity={0.55} strokeLinejoin="round" />
        <path d={line} fill="none" stroke={C.ground} strokeWidth={1.4} strokeLinejoin="round" />

        {/* The noon shadows of the tallest tree on the ground, December's long, June's short. */}
        {sun && shadowTree && (['december', 'june'] as const).map((season) => {
          const shadow = noonShadow(shadowTree.plant, shadowTree.h, sun, season)
          const to = Math.max(0, Math.min(data.lengthM, shadow.to))
          return (
            <polyline
              key={`s${season}`} points={shadowPoints(layout, shadow.from, to)} fill="none"
              stroke={season === 'december' ? W.shadowDecember : W.shadowJune} strokeWidth={season === 'december' ? 5 : 7}
              opacity={season === 'december' ? 0.28 : 0.35} strokeLinecap="round"
            />
          )
        })}

        {/* Water dug into the ground, its berm on the downhill side. */}
        {data.crossings.filter(isWaterCrossing).map((c) => <Water key={`w${c.id}`} c={c} layout={layout} />)}

        {/* Hedges, at their height that year. */}
        {data.crossings.filter((c) => c.hedge).map((c) => {
          const h = c.hedge?.[moment] ?? 0
          const mid = (c.from + c.to) / 2
          const half = Math.max(1, (c.to - c.from) / 2, (c.widthM ?? 2) / 2)
          const foot = y(groundAt(mid))
          const top = foot - h * layout.sy
          const x0 = x(mid - half)
          const x1 = x(mid + half)
          const bumps = Math.max(1, Math.round((x1 - x0) / 10))
          const step = (x1 - x0) / bumps
          const crown = Array.from({ length: bumps }, (_, i) => `Q${x0 + step * (i + 0.5)} ${top - Math.min(6, h * layout.sy * 0.15)} ${x0 + step * (i + 1)} ${top}`).join(' ')
          return <path key={`h${c.id}`} d={`M${x0} ${foot} L${x0} ${top} ${crown} L${x1} ${foot} Z`} fill={W.hedge} fillOpacity={0.75} stroke={W.hedgeEdge} strokeWidth={0.8} />
        })}

        {/* Paths, banks, zones, hedges: a tick on the ground and a label above. */}
        {labels.map((l, i) => {
          const isZone = l.c.to - l.c.from > 1 && !l.c.hedge
          const gy = y(groundAt((l.c.from + l.c.to) / 2)) - (l.c.hedge ? (l.c.hedge[moment] ?? 0) * layout.sy : 0)
          const ly = 34 + rows[i] * (labelSize + 2)
          const ink = l.c.layer === 'water' ? C.water : l.c.layer === 'access' ? C.access : l.c.hedge ? W.hedgeEdge : C.soft
          return (
            <g key={`c${l.c.id}`}>
              {isZone && <line x1={x(l.c.from)} x2={x(l.c.to)} y1={ly + 3} y2={ly + 3} stroke={ink} strokeWidth={0.8} opacity={0.6} />}
              <line x1={l.x} x2={l.tick} y1={ly + 4} y2={gy - 2} stroke={ink} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.6} />
              <text x={l.x} y={ly} textAnchor="middle" fontFamily={FONT} fontSize={labelSize} fill={ink} stroke={C.paper} strokeWidth={3} paintOrder="stroke">{l.text}</text>
            </g>
          )
        })}

        {/* The plants. */}
        {plants.map((plant) => {
          const depth = 1 - Math.min(1, Math.abs(plant.offset) / corridor)
          const opacity = 0.45 + 0.55 * depth
          const size = plant.sizes[moment]
          const color = plant.existing ? C.faint : STRATA_COLORS[plant.strata as Strata] ?? STRATA_COLORS.shrub
          const adult = plantShape(plant, plant.adult, layout)
          const ghost = showGhost && (!size || size.h < plant.adult.h * 0.95)
          if (!size) {
            // Not in the ground yet at that moment, or a support plant gone: its stake only.
            const foot = y(plant.z ?? groundAt(plant.d))
            return (
              <g key={plant.id} opacity={opacity}>
                {ghost && <Silhouette plant={plant} shape={adult} color={color} dashed />}
                <line x1={x(plant.d)} x2={x(plant.d)} y1={foot} y2={foot - 8} stroke={C.faint} strokeWidth={1} />
              </g>
            )
          }
          const shape = plantShape(plant, size, layout)
          return (
            <g key={plant.id} opacity={opacity}>
              {ghost && <Silhouette plant={plant} shape={adult} color={color} dashed />}
              {shape.trunk > 0 && (
                <line x1={shape.cx} x2={shape.cx} y1={shape.foot} y2={shape.cy + shape.ry * 0.6} stroke={C.ground} strokeWidth={Math.max(1, Math.min(4, shape.rx * 0.12))} strokeLinecap="round" />
              )}
              <Silhouette plant={plant} shape={shape} color={color} />
              {plant.code && depth > 0.35 && (
                <text x={shape.cx} y={shape.top - 3} textAnchor="middle" fontFamily={FONT} fontSize={small ? 10.5 : 11} fontWeight={600} fill={C.ink} stroke={C.paper} strokeWidth={2.5} paintOrder="stroke">{plant.code}</text>
              )}
            </g>
          )
        })}

        {/* The noon sun of June and December, grazing the top of the tallest tree; the south marked. */}
        {sun && (
          <g fontFamily={FONT} fontSize={labelSize} textAnchor={sun.from === 'start' ? 'start' : 'end'}>
            <text x={sun.from === 'start' ? 6 : width - 6} y={layout.top - 4} fontWeight={600} fill={W.shadowJune}>
              {sun.from === 'start' ? `☀ ${t('section.south')}` : `${t('section.south')} ☀`}
            </text>
            {/* Which ray is which, under the south: the drawing keeps its names for the plants and crossings. */}
            {shadowTree && (['june', 'december'] as const).map((season, i) => (
              <text key={season} x={sun.from === 'start' ? 6 : width - 6} y={layout.top + 10 + i * (labelSize + 3)} fill={season === 'june' ? W.shadowJune : C.sunDecember} stroke={C.paper} strokeWidth={2.5} paintOrder="stroke">
                {`${season === 'june' ? '—' : '- -'} ${t(`section.sun_${season}`)} ${formatNumber(Math.round(sun[season]))}°`}
              </text>
            ))}
          </g>
        )}
        {sun && shadowTree && (['june', 'december'] as const).map((season) => {
          const shadow = noonShadow(shadowTree.plant, shadowTree.h, sun, season)
          const topY = y((shadowTree.plant.z ?? groundAt(shadowTree.plant.d)) + shadowTree.h)
          const topX = x(shadowTree.plant.d)
          const tip = Math.max(0, Math.min(data.lengthM, shadow.to))
          // Where the ray is at the tip (on the ground, or above it when the shadow runs off the section).
          const share = Math.abs(tip - shadow.from) / Math.max(0.01, Math.abs(shadow.to - shadow.from))
          const tipY = topY + (y(groundAt(shadow.to)) - topY) * share
          // Back towards the sun, but never up into the rows of names.
          const ceiling = layout.top + 14
          const back = Math.min(0.6, tipY - topY > 0.5 ? Math.max(0, (topY - ceiling) / (tipY - topY)) : 0.6)
          const startX = topX - (x(tip) - topX) * back
          const startY = topY - (tipY - topY) * back
          const ink = season === 'june' ? W.shadowJune : C.sunDecember
          return (
            <g key={`r${season}`}>
              <line x1={startX} y1={startY} x2={x(tip)} y2={tipY} stroke={ink} strokeWidth={1.2} strokeDasharray={season === 'december' ? '4 3' : undefined} opacity={0.9} />
            </g>
          )
        })}

        {/* A and A′. */}
        {([0, data.lengthM] as const).map((d, i) => (
          <text key={d} x={x(d)} y={y(groundAt(d)) - 8} textAnchor={i ? 'end' : 'start'} fontFamily={SERIF} fontSize={17} fontWeight={700} fill={C.line}>
            {i ? t('section.end') : t('section.start')}
          </text>
        ))}

        {/* Distances along the line, a bar of heights, the key of the codes. */}
        <line x1={layout.left} x2={width - layout.right} y1={floor} y2={floor} stroke={C.faint} strokeWidth={0.8} />
        {ticks.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={floor} y2={floor + 4} stroke={C.faint} strokeWidth={0.8} />
            <text x={x(d)} y={floor + 15} textAnchor="middle" fontFamily={FONT} fontSize={10.5} fill={C.soft}>{t('section.axis_m', { value: formatNumber(d) })}</text>
          </g>
        ))}
        <g>
          <line x1={14} x2={14} y1={floor - 14} y2={floor - 14 - barM * layout.sy} stroke={C.soft} strokeWidth={1.2} />
          <line x1={10} x2={18} y1={floor - 14} y2={floor - 14} stroke={C.soft} strokeWidth={1.2} />
          <line x1={10} x2={18} y1={floor - 14 - barM * layout.sy} y2={floor - 14 - barM * layout.sy} stroke={C.soft} strokeWidth={1.2} />
          <text x={20} y={floor - 14 - (barM * layout.sy) / 2} fontFamily={FONT} fontSize={10} fill={C.soft} dominantBaseline="middle">{t('section.axis_m', { value: barM })}</text>
        </g>
        {keyText && (
          <text x={layout.left} y={height - 8} fontFamily={FONT} fontSize={10.5} fill={C.soft}>
            <title>{keyText}</title>
            {clip(keyText, (width - layout.left - 150) / 5.8)}
          </text>
        )}
        {layout.exaggeration > 1.15 && (
          <text x={width - layout.right} y={height - 8} textAnchor="end" fontFamily={FONT} fontSize={10} fill={C.faint}>
            {t('section.exaggeration', { factor: formatNumber(Math.round(layout.exaggeration * 10) / 10) })}
          </text>
        )}
      </svg>
    )
  },
)

const clip = (text: string, chars: number) => (text.length > chars ? `${text.slice(0, Math.max(10, Math.floor(chars) - 1))}…` : text)

/** Points along the ground between two distances, for a shadow lying on it. */
function shadowPoints(layout: SectionLayout, a: number, b: number): string {
  const from = Math.min(a, b)
  const to = Math.max(a, b)
  const steps = 12
  return Array.from({ length: steps + 1 }, (_, i) => {
    const d = from + ((to - from) * i) / steps
    return `${layout.x(d).toFixed(1)},${(layout.y(layout.groundAt(d)) - 2).toFixed(1)}`
  }).join(' ')
}

/** A swale, a ditch or a pond, dug at its width and depth (indicative when not noted), its berm downhill. */
function Water({ c, layout }: { c: SectionData['crossings'][number]; layout: SectionLayout }) {
  const { x, y, groundAt, sx, sy } = layout
  const mid = (c.from + c.to) / 2
  const width = Math.max(c.to - c.from, c.widthM ?? 1.5)
  const depth = c.depthM ?? 0.4
  const half = Math.max(5, (width / 2) * sx)
  const dig = Math.max(5, depth * sy)
  const gy = y(groundAt(mid))
  // Downhill: the side where the ground is lower a little further on.
  const downhillEnd = groundAt(Math.min(c.to + 2, mid + width)) < groundAt(Math.max(0, mid - width))
  const side = downhillEnd ? 1 : -1
  const bermX = x(mid) + side * half
  const berm = Math.max(3, dig * 0.6)
  const isPond = c.kind === 'pond' || c.kind === 'mare' || width > 4
  return (
    <g>
      <path d={`M${x(mid) - half} ${gy} Q${x(mid)} ${gy + dig * 2} ${x(mid) + half} ${gy} Z`} fill={C.waterWash} stroke={C.water} strokeWidth={1.2} />
      {!isPond && (
        <path d={`M${bermX} ${gy} Q${bermX + side * half} ${gy - berm * 2} ${bermX + side * half * 2} ${gy} Z`} fill={C.topsoil} fillOpacity={0.7} stroke={C.ground} strokeWidth={0.8} />
      )}
    </g>
  )
}

/**
 * One silhouette per layer, as a designer draws them: a broad cumulus for
 * the canopy, an upright oval for the small trees, a mound of stems for a
 * shrub, a tuft for a perennial, a low band for a ground cover, a climbing
 * stem for a vine.
 */
function Silhouette({ plant, shape, color, dashed }: { plant: SectionPlant; shape: ReturnType<typeof plantShape>; color: string; dashed?: boolean }): ReactNode {
  const paint = dashed
    ? { fill: 'none', stroke: color, strokeWidth: 0.9, strokeDasharray: '3 2', opacity: 0.7 }
    : { fill: color, fillOpacity: plant.existing ? 0.45 : 0.78, stroke: color, strokeWidth: 0.8 }
  const { cx, cy, rx, ry, foot, top } = shape
  switch (plant.strata) {
    case 'canopy': {
      // Three lobes, the middle one highest: a broad, rounded crown.
      const r = rx * 0.55
      const d = `M${cx - rx} ${cy + ry * 0.35} `
        + `A${r} ${ry * 0.75} 0 0 1 ${cx - rx * 0.35} ${cy - ry * 0.55} `
        + `A${r} ${ry * 0.8} 0 0 1 ${cx + rx * 0.35} ${cy - ry * 0.55} `
        + `A${r} ${ry * 0.75} 0 0 1 ${cx + rx} ${cy + ry * 0.35} `
        + `Q${cx} ${cy + ry * 1.15} ${cx - rx} ${cy + ry * 0.35} Z`
      return <path d={d} {...paint} />
    }
    case 'sub_canopy':
      return <ellipse cx={cx} cy={cy} rx={rx * 0.85} ry={ry} {...paint} />
    case 'shrub': {
      // A mound of stems: three domes side by side, the middle one taller.
      const h = foot - top
      const w = rx
      const d = `M${cx - w} ${foot} Q${cx - w} ${foot - h * 0.8} ${cx - w * 0.35} ${foot - h * 0.75} `
        + `Q${cx} ${foot - h * 1.15} ${cx + w * 0.35} ${foot - h * 0.75} `
        + `Q${cx + w} ${foot - h * 0.8} ${cx + w} ${foot} Z`
      return <path d={d} {...paint} />
    }
    case 'ground_cover': {
      const h = Math.max(3, foot - top)
      return <rect x={cx - rx} y={foot - h} width={rx * 2} height={h} rx={Math.min(h, rx) / 2} {...paint} />
    }
    case 'vine':
      return <path d={`M${cx} ${foot} C${cx - rx} ${foot - (foot - top) * 0.33} ${cx + rx} ${foot - (foot - top) * 0.66} ${cx} ${top}`} fill="none" stroke={color} strokeWidth={dashed ? 0.9 : 2} strokeDasharray={dashed ? '3 2' : undefined} />
    default: {
      // A perennial: a narrow tuft.
      const d = `M${cx - rx} ${foot} Q${cx - rx * 0.6} ${top} ${cx} ${top} Q${cx + rx * 0.6} ${top} ${cx + rx} ${foot} Z`
      return <path d={d} {...paint} />
    }
  }
}
