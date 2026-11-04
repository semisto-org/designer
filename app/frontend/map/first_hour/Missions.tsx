import clsx from 'clsx'
import { CheckCircle2, Circle, Droplets, Snowflake, Sprout } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { FirstHourMission, FirstHourMissions } from '@/types/journey'

const ICON = { water: Droplets, season: Snowflake, living: Sprout } as const

/** The month's signs, by name: « le givre reste ici, la neige fond d'abord ici ». */
export function signNames(signs: string[]): string {
  return signs.map((sign) => t(`drawing.options.sign.${sign}`).toLowerCase()).join(', ')
}

export const missionsDone = (missions: FirstHourMission[]) => missions.filter((m) => m.done).length

/**
 * « Ce que les cartes ne savent pas »: the three things to go and see outside,
 * each ticked by itself once the observation is on the map (a downpour or a
 * puddle noted, a sign of the season, three wild plants).
 */
export function MissionList({ data, compact = false }: { data: FirstHourMissions; compact?: boolean }) {
  return (
    <ul className={clsx('flex flex-col', compact ? 'gap-1.5' : 'gap-3')}>
      {data.missions.map((mission) => {
        const Icon = ICON[mission.key]
        const Tick = mission.done ? CheckCircle2 : Circle
        const status = t(mission.done ? 'place_reading.missions.done' : 'place_reading.missions.todo')
        return (
          <li key={mission.key} className="flex gap-2.5">
            <Tick className={clsx('mt-0.5 h-5 w-5 shrink-0', mission.done ? 'text-leaf-600' : 'text-loam-300')} aria-label={status} />
            <div className="min-w-0 space-y-0.5">
              <p className={clsx('flex items-center gap-1.5 text-sm font-semibold', mission.done ? 'text-leaf-800' : 'text-loam-900')}>
                <Icon className="h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
                {t(`place_reading.missions.${mission.key}.title`)}
                {mission.key === 'living' && !mission.done && mission.count > 0 && (
                  <span className="font-normal text-loam-500">
                    · {t('place_reading.missions.living.count', { count: mission.count, target: mission.target ?? 3 })}
                  </span>
                )}
              </p>
              {!compact && (
                <p className="text-sm leading-[1.45] text-loam-600">
                  {mission.done
                    ? t(`place_reading.missions.${mission.key}.done`)
                    : t(`place_reading.missions.${mission.key}.body`, { signs: signNames(data.signs) })}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
