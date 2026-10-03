const relative = new Intl.RelativeTimeFormat('fr-BE', { numeric: 'auto' })
const date = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "il y a 5 minutes", "hier", then a plain date after a week. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return "à l'instant"
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day')
  return date.format(new Date(iso))
}

export const formatDate = (iso: string) => date.format(new Date(iso))
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
