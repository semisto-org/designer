import { forwardRef } from 'react'
import { formatNumber, t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strataColors'
import type { Strata } from '@/types/plants'
import { SECTION_COLORS as C } from './colors'
import {
  distanceTicks, groundPaths, isWaterCrossing, labelRows, noonSunInSection, plantShape, sectionLayout,
  type SectionData, type SectionMoment,
} from './section'

const FONT = 'Inter, system-ui, sans-serif'
const SERIF = '"EB Garamond", Georgia, serif'

/**
 * The section, drawn as a designer draws one on the board: the paper, the
 * ground and a slice of soil, the water cut into it, the paths and banks the
 * line crosses, each plant at its size at the moment (its adult size in
 * dotted line behind), its species code, the noon sun of June and December
 * when the line runs towards it, A and A′ at the ends, and the scale.
 */
export const SectionDrawing = forwardRef<SVGSVGElement, { data: SectionData; moment: SectionMoment; width: number; height: number }>(
  function SectionDrawing({ data, moment, width, height }, ref) {
    const layout = sectionLayout(data, width, height)
    const { line, soil } = groundPaths(data, layout)
    const { x, y, groundAt } = layout
    const corridor = Math.max(0.5, data.corridorM)
    // Far plants first, paler: the section looks through the band.
    const plants = [...data.plants].sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset))
    const shown = moment === 'year30' ? null : moment
    const info = data.moments.find((m) => m.key === moment)
    const title = `${t('section.panel_title')} ${t('section.start')}–${t('section.end')} · ${t(`section.moments.${moment}`)}${info ? ` ${t('section.calendar_year', { year: info.calendarYear })}` : ''}`

    const named = data.crossings.filter((c) => !isWaterCrossing(c) || c.name)
    const labels = named.map((c) => {
      const text = c.name ?? t(`editor.kinds.${c.kind}`)
      const w = text.length * 6 + 8
      // Kept on the sheet: a label at an end leans inwards.
      const at = Math.max(layout.left - 30 + w / 2, Math.min(width - 4 - w / 2, x((c.from + c.to) / 2)))
      return { c, text, x: at, tick: x((c.from + c.to) / 2), width: w }
    })
    const rows = labelRows(labels.map((l) => ({ x: l.x, width: l.width })), 3)
    const sun = noonSunInSection(data.bearing, data.line[0]?.[1] ?? 50)
    const ticks = distanceTicks(data.lengthM)
    const floor = height - layout.bottom
    // A 5 or 10 m scale of heights at the left, true to the drawing.
    const barM = layout.sy * 10 > (height - layout.top - layout.bottom) * 0.6 ? 5 : 10

    return (
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={title} style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
        <rect x={0} y={0} width={width} height={height} fill={C.paper} />
        <text x={layout.left} y={16} fontFamily={SERIF} fontSize={15} fontWeight={600} fill={C.ink}>{title}</text>

        {/* The soil, its topsoil, and the ground line. */}
        <path d={soil} fill={C.soil} opacity={0.55} />
        <path d={line} fill="none" stroke={C.topsoil} strokeWidth={6} opacity={0.55} strokeLinejoin="round" />
        <path d={line} fill="none" stroke={C.ground} strokeWidth={1.4} strokeLinejoin="round" />

        {/* Water cut into the ground. */}
        {data.crossings.filter(isWaterCrossing).map((c) => {
          const mid = (c.from + c.to) / 2
          const half = Math.max(4, ((c.to - c.from) / 2) * layout.sx)
          const gy = y(groundAt(mid))
          const depth = Math.max(4, Math.min(12, half * 0.5))
          return (
            <g key={`w${c.id}`}>
              <path d={`M${x(mid) - half} ${gy} Q${x(mid)} ${gy + depth * 2} ${x(mid) + half} ${gy} Z`} fill={C.waterWash} stroke={C.water} strokeWidth={1.2} />
            </g>
          )
        })}

        {/* Paths, banks, zones: a tick on the ground and a label above. */}
        {labels.map((l, i) => {
          const isZone = l.c.to - l.c.from > 1
          const gy = y(groundAt((l.c.from + l.c.to) / 2))
          const ly = layout.top - 30 + rows[i] * 12
          const ink = l.c.layer === 'water' ? C.water : l.c.layer === 'access' ? C.access : C.soft
          return (
            <g key={`c${l.c.id}`}>
              {isZone && <line x1={x(l.c.from)} x2={x(l.c.to)} y1={ly + 3} y2={ly + 3} stroke={ink} strokeWidth={0.8} opacity={0.6} />}
              <line x1={l.x} x2={l.tick} y1={ly + 4} y2={gy - 2} stroke={ink} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.6} />
              <text x={l.x} y={ly} textAnchor="middle" fontFamily={FONT} fontSize={10} fill={ink} stroke={C.paper} strokeWidth={3} paintOrder="stroke">{l.text}</text>
            </g>
          )
        })}

        {/* The plants. */}
        {plants.map((plant) => {
          const color = STRATA_COLORS[plant.strata as Strata] ?? STRATA_COLORS.shrub
          const depth = 1 - Math.min(1, Math.abs(plant.offset) / corridor)
          const opacity = 0.45 + 0.55 * depth
          const size = plant.sizes[moment]
          const adult = plantShape(plant, plant.adult, layout)
          const ghost = shown && (!size || size.h < plant.adult.h * 0.95)
          if (!size) {
            // Not in the ground yet at that moment, or a support plant gone: its stake only.
            const foot = y(plant.z ?? groundAt(plant.d))
            return (
              <g key={plant.id} opacity={opacity}>
                {ghost && <Crown shape={adult} color={color} dashed />}
                <line x1={x(plant.d)} x2={x(plant.d)} y1={foot} y2={foot - 8} stroke={C.faint} strokeWidth={1} />
              </g>
            )
          }
          const shape = plantShape(plant, size, layout)
          return (
            <g key={plant.id} opacity={opacity}>
              {ghost && <Crown shape={adult} color={color} dashed />}
              {shape.trunk > 0 && (
                <line x1={shape.cx} x2={shape.cx} y1={shape.foot} y2={shape.cy + shape.ry * 0.6} stroke={C.ground} strokeWidth={Math.max(1, Math.min(4, shape.rx * 0.12))} strokeLinecap="round" />
              )}
              <Crown shape={shape} color={color} existing={plant.existing} />
              {plant.code && depth > 0.35 && (
                <text x={shape.cx} y={shape.top - 3} textAnchor="middle" fontFamily={FONT} fontSize={9} fontWeight={600} fill={C.ink} stroke={C.paper} strokeWidth={2.5} paintOrder="stroke">{plant.code}</text>
              )}
            </g>
          )
        })}

        {/* The noon sun of June and December, from the side it comes from. */}
        {sun && (['june', 'december'] as const).map((season, i) => {
          const angle = (sun[season] * Math.PI) / 180
          const fromStart = sun.from === 'start'
          const x0 = fromStart ? layout.left + 4 : width - layout.right - 4
          const y0 = layout.top + 2
          const len = 46
          const dx = Math.cos(angle) * len * (fromStart ? 1 : -1)
          const dy = Math.sin(angle) * len
          const ink = season === 'june' ? C.sunJune : C.sunDecember
          return (
            <g key={season}>
              <line x1={x0} y1={y0} x2={x0 + dx} y2={y0 + dy} stroke={ink} strokeWidth={1.6} strokeDasharray={season === 'december' ? '3 2' : undefined} />
              <circle cx={x0} cy={y0} r={3.5 - i} fill={ink} />
              <text x={x0 + dx + (fromStart ? 3 : -3)} y={y0 + dy + 3} textAnchor={fromStart ? 'start' : 'end'} fontFamily={FONT} fontSize={9} fill={ink}>
                {t(`section.sun_${season}`)} {formatNumber(Math.round(sun[season]))}°
              </text>
            </g>
          )
        })}

        {/* A and A′. */}
        {([0, data.lengthM] as const).map((d, i) => (
          <text key={d} x={x(d)} y={y(groundAt(d)) - 8} textAnchor={i ? 'end' : 'start'} fontFamily={SERIF} fontSize={16} fontWeight={700} fill={C.line}>
            {i ? t('section.end') : t('section.start')}
          </text>
        ))}

        {/* Distances along the line, and a bar of heights. */}
        <line x1={layout.left} x2={width - layout.right} y1={floor} y2={floor} stroke={C.faint} strokeWidth={0.8} />
        {ticks.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={floor} y2={floor + 4} stroke={C.faint} strokeWidth={0.8} />
            <text x={x(d)} y={floor + 15} textAnchor="middle" fontFamily={FONT} fontSize={9.5} fill={C.soft}>{t('section.axis_m', { value: formatNumber(d) })}</text>
          </g>
        ))}
        <g>
          <line x1={14} x2={14} y1={floor - 14} y2={floor - 14 - barM * layout.sy} stroke={C.soft} strokeWidth={1.2} />
          <line x1={10} x2={18} y1={floor - 14} y2={floor - 14} stroke={C.soft} strokeWidth={1.2} />
          <line x1={10} x2={18} y1={floor - 14 - barM * layout.sy} y2={floor - 14 - barM * layout.sy} stroke={C.soft} strokeWidth={1.2} />
          <text x={20} y={floor - 14 - (barM * layout.sy) / 2} fontFamily={FONT} fontSize={9} fill={C.soft} dominantBaseline="middle">{t('section.axis_m', { value: barM })}</text>
        </g>
        {layout.exaggeration > 1.15 && (
          <text x={width - layout.right} y={height - 4} textAnchor="end" fontFamily={FONT} fontSize={9} fill={C.faint}>
            {t('section.exaggeration', { factor: formatNumber(Math.round(layout.exaggeration * 10) / 10) })}
          </text>
        )}
      </svg>
    )
  },
)

function Crown({ shape, color, dashed, existing }: { shape: ReturnType<typeof plantShape>; color: string; dashed?: boolean; existing?: boolean }) {
  if (shape.kind === 'dome') {
    const d = `M${shape.cx - shape.rx} ${shape.foot} A${shape.rx} ${shape.ry} 0 0 1 ${shape.cx + shape.rx} ${shape.foot} Z`
    return dashed
      ? <path d={d} fill="none" stroke={color} strokeWidth={0.9} strokeDasharray="3 2" opacity={0.7} />
      : <path d={d} fill={color} fillOpacity={0.78} stroke={color} strokeWidth={0.8} />
  }
  return dashed
    ? <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill="none" stroke={color} strokeWidth={0.9} strokeDasharray="3 2" opacity={0.7} />
    : <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={existing ? C.faint : color} fillOpacity={existing ? 0.45 : 0.78} stroke={existing ? C.faint : color} strokeWidth={0.8} />
}
