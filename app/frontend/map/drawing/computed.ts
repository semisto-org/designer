import { formatArea, formatNumber, t } from '@/lib/i18n'
import { measure } from '@/map/editor/measure'
import type { MapFeature } from '@/types'
import type { ElementSpec } from '@/types/drawing'

export type ComputedValue = { key: string; label: string; value: string; hint: string }

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function volume(m3: number): string {
  const liters = t('drawing.computed.liters', { value: formatNumber(Math.round(m3 * 1000)) })
  if (m3 < 1) return liters
  return `${t('drawing.computed.cubic_meters', { value: formatNumber(Math.round(m3 * 10) / 10) })} (${liters})`
}

// Formulas of the `computed` entries of the element library. Each returns
// null when an input is missing: never a number without its data.
const FORMULAS: Record<string, (p: Record<string, unknown>, m: { area: number | null; length: number | null }) => string | null> = {
  pond_volume: (p, m) => (m.area != null && num(p.depth_m) != null ? volume(m.area * num(p.depth_m)! * 0.5) : null),
  swale_volume: (p, m) =>
    m.length != null && num(p.width_m) != null && num(p.depth_m) != null ? volume(m.length * num(p.width_m)! * num(p.depth_m)! * 0.5) : null,
  rain_garden_volume: (p, m) => (m.area != null && num(p.depth_m) != null ? volume(m.area * num(p.depth_m)!) : null),
  raised_bed_soil: (p, m) => (m.area != null && num(p.height_m) != null ? volume(m.area * num(p.height_m)!) : null),
  hedge_plants: (p, m) => {
    const spacing = num(p.spacing_m)
    const rows = num(p.rows)
    if (m.length == null || !spacing || !rows) return null
    return t('drawing.computed.plants', { count: (Math.floor(m.length / spacing) + 1) * rows })
  },
  paddock_density: (p, m) => {
    const headcount = num(p.headcount)
    if (m.area == null || !headcount) return null
    return t('drawing.computed.per_head', { value: formatArea(m.area / headcount) })
  },
}

/** Derived values of a feature (pond volume, plants for a hedge…). */
export function computedValues(feature: MapFeature, spec: ElementSpec): ComputedValue[] {
  const m = measure(feature.geometry)
  return spec.computed.flatMap((key) => {
    const value = FORMULAS[key]?.(feature.properties, m)
    if (value == null) return []
    return [{ key, label: t(`drawing.computed.${key}.label`), hint: t(`drawing.computed.${key}.hint`), value }]
  })
}
