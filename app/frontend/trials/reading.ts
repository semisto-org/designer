// The companion's first words on a tried place (« Et chez toi ? »): the
// numbers of Trials::Reading turned into a few plain sentences, slope and
// water first (water before plants), then the sun, then the room there is.
// Pure: it says which sentence (a key of trials.reading) with which values;
// the page translates them.
import type { Compass, TrialReading } from '../types/trials.ts'

/** Below this the slope is called gentle (in %). */
const GENTLE_PCT = 4
/** One fruit tree, its shrubs and its herbs below, about every 50 m². */
export const M2_PER_TREE = 50

export type Facing = 'north' | 'east' | 'south' | 'west'

export type ReadingLine =
  | { key: 'slope'; downhill: Compass; slope: number; drop: number }
  | { key: 'gentle'; downhill: Compass; slope: number }
  | { key: 'water_side'; side: Compass }
  | { key: 'water_low' }
  | { key: 'sun'; facing: Facing }
  | { key: 'flat' }
  | { key: 'area'; area: number; count: number }
  | { key: 'small'; area: number }

const FACING: Record<Compass, Facing> = {
  n: 'north', ne: 'north', nw: 'north', e: 'east', w: 'west', s: 'south', se: 'south', sw: 'south',
}

export function readingLines(reading: TrialReading, areaM2: number | null): ReadingLine[] {
  const out: ReadingLine[] = []
  const { slope_pct: slope, downhill } = reading
  if (slope != null && downhill) {
    out.push(slope < GENTLE_PCT || reading.drop_m == null
      ? { key: 'gentle', downhill, slope }
      : { key: 'slope', downhill, slope, drop: reading.drop_m })
    out.push(reading.low_side ? { key: 'water_side', side: reading.low_side } : { key: 'water_low' })
    out.push({ key: 'sun', facing: FACING[downhill] })
  } else if (slope != null) {
    out.push({ key: 'flat' })
  }
  const area = areaM2 ?? reading.area_m2
  if (area) {
    const count = Math.round(area / M2_PER_TREE)
    out.push(count >= 2 ? { key: 'area', area, count } : { key: 'small', area })
  }
  return out
}
