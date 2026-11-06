import { ChevronLeft, ChevronRight, Flower2, Snowflake, Sun } from 'lucide-react'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { layerStore } from '@/map/data/store'
import { infraredTwins, isInfrared, seasonOf, trueColourKey, vintageLabel, yearOf, yearsAgo } from '@/map/data/photoArchive'
import type { RegionLayerData } from '@/types'

const SEASON_ICON = { spring: Flower2, summer: Sun, winter: Snowflake } as const

/**
 * The aerial photos of the place through time, from the oldest flight to
 * today: a slider to slide through the years (the photo changes under the
 * finger), the season of each flight, and its false colour infrared twin
 * when there is one. Partial flights that miss this map are left out.
 */
export default function PhotoTimeline({ steps, layers, base, missing }: {
  steps: RegionLayerData[]
  layers: RegionLayerData[]
  base: string | null
  /** Partial flights left out because they do not pass over this map. */
  missing: number
}) {
  const twins = infraredTwins(layers)
  const current = trueColourKey(layers, base)
  const index = Math.max(0, steps.findIndex((l) => l.key === current))
  const step = steps[index]
  if (!step) return null
  const infraredOn = layers.some((l) => l.key === base && isInfrared(l))
  const twin = twins.get(step.key)

  const go = (next: number) => {
    const target = steps[Math.min(steps.length - 1, Math.max(0, next))]
    if (!target) return
    const targetTwin = twins.get(target.key)
    layerStore.setBase(infraredOn && targetTwin ? targetTwin.key : target.key)
  }

  const label = vintageLabel(step)
  const ago = yearsAgo(step)
  const season = seasonOf(step)
  const SeasonIcon = season ? SEASON_ICON[season] : null
  const first = steps[0]
  const old = (yearOf(step) ?? 9999) < 2000

  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-loam-50 p-3 ring-1 ring-inset ring-loam-200">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 font-serif text-xl leading-tight text-loam-900" aria-live="polite">
          {SeasonIcon && <SeasonIcon className="h-4 w-4 shrink-0 text-loam-500" aria-label={t(`map_data.photos.seasons.${season}`)} />}
          <span className="first-letter:uppercase">{label}</span>
        </p>
        <p className="shrink-0 text-sm text-loam-500">
          {ago == null ? t('map_data.photos.latest') : t('map_data.photos.years_ago', { count: ago })}
        </p>
      </div>

      {steps.length > 1 && (
        <div>
          <div className="flex items-center gap-1">
            <IconButton label={t('map_data.photos.older')} size="sm" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft aria-hidden />
            </IconButton>
            <input
              type="range"
              min={0}
              max={steps.length - 1}
              step={1}
              value={index}
              onChange={(e) => go(Number(e.target.value))}
              aria-label={t('map_data.photos.slider')}
              aria-valuetext={label}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-prune-600"
            />
            <IconButton label={t('map_data.photos.newer')} size="sm" disabled={index === steps.length - 1} onClick={() => go(index + 1)}>
              <ChevronRight aria-hidden />
            </IconButton>
          </div>
          <div className="flex justify-between px-9 text-sm tabular-nums text-loam-500" aria-hidden="true">
            <span>{yearOf(first) ?? vintageLabel(first)}</span>
            <span>{t('map_data.photos.today')}</span>
          </div>
        </div>
      )}

      {twin && (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-loam-800">
          <input
            type="checkbox"
            checked={infraredOn}
            onChange={(e) => layerStore.setBase(e.target.checked ? twin.key : step.key)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
          />
          <span>
            <span className="font-medium">{t('map_data.photos.infrared')}</span>
            <span className="block text-loam-500">{t('map_data.photos.infrared_hint')}</span>
          </span>
        </label>
      )}

      {!infraredOn && step.description && <p className="text-sm text-loam-600">{step.description}</p>}
      {missing > 0 && <p className="text-sm text-loam-500">{t('map_data.photos.missing', { count: missing })}</p>}
      {old && <HandNote tone="leaf">{t('map_data.photos.go_see')}</HandNote>}
    </div>
  )
}
