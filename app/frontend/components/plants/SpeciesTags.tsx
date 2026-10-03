import { t } from '@/lib/i18n'
import type { SpeciesSummary } from '@/types/plants'

/** Small tags for what matters in a design: food, nitrogen, bees, natives, invasives. */
export function SpeciesTags({ species, country }: { species: SpeciesSummary; country?: string | null }) {
  const tags: { key: string; label: string; tone: string }[] = []
  if (species.edibleRating || species.edibleParts.length > 0) tags.push({ key: 'edible', label: t('plants.filters.edible'), tone: 'bg-humus-50 text-humus-700' })
  if (species.ecoServices.includes('nitrogen')) tags.push({ key: 'nitrogen', label: t('plants.filters.nitrogen'), tone: 'bg-leaf-50 text-leaf-700' })
  if (species.ecoServices.includes('mellifere')) tags.push({ key: 'mellifere', label: t('plants.filters.mellifere'), tone: 'bg-humus-50 text-humus-700' })
  if (country && species.nativeCountries.includes(country)) tags.push({ key: 'native', label: t('plants.card.native'), tone: 'bg-lichen-100 text-lichen-700' })
  if (country && species.invasiveCountries.includes(country)) tags.push({ key: 'invasive', label: t('plants.card.invasive'), tone: 'bg-clay-50 text-clay-700' })
  if (tags.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => <span key={tag.key} className={'rounded px-1.5 py-px text-[11px] ' + tag.tone}>{tag.label}</span>)}
    </span>
  )
}
