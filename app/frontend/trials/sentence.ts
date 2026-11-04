// A line of the place's first reading (trials/reading.ts) in words, for a
// tried place (« Et chez toi ? ») and a map's « Voici ton lieu ».
import { formatArea, t } from '@/lib/i18n'
import type { ReadingLine } from '@/trials/reading'

const decimal = (value: number) => (Math.round(value * 10) / 10).toLocaleString('fr-BE')

export function readingSentence(line: ReadingLine): string {
  switch (line.key) {
    case 'slope':
      return t('trials.reading.slope', { direction: t(`trials.reading.directions.${line.downhill}`), slope: decimal(line.slope), drop: decimal(line.drop) })
    case 'gentle':
      return t('trials.reading.gentle', { direction: t(`trials.reading.directions.${line.downhill}`), slope: decimal(line.slope) })
    case 'water_side':
      return t('trials.reading.water_side', { side: t(`trials.reading.sides.${line.side}`) })
    case 'sun':
      return t(`trials.reading.sun.${line.facing}`)
    case 'area':
      return t('trials.reading.area', { area: formatArea(line.area), count: line.count })
    case 'small':
      return t('trials.reading.small', { area: formatArea(line.area) })
    default:
      return t(`trials.reading.${line.key}`)
  }
}
