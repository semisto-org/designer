import { t } from '@/lib/i18n'

const dateFormat = new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })

/** Today's date and what the season invites to look at, hand-written. */
export function SeasonNote({ now = new Date() }: { now?: Date }) {
  const date = dateFormat.format(now)
  return (
    <p className="mt-1.5 max-w-[46ch] font-hand text-[1.45rem] leading-tight text-prune-600">
      {date.charAt(0).toUpperCase() + date.slice(1)}. {t(`my_maps.seasons.${now.getMonth() + 1}`)}
    </p>
  )
}
