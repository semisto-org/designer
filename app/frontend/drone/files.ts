// Sizes and days of the files someone imports as a drone view.
/** "1,8 Go", "640 Mo" */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toLocaleString('fr-BE', { maximumFractionDigits: 1 })} Go`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2)).toLocaleString('fr-BE')} Mo`
}

/** The day a file was last written (a drone export keeps the flight's day), as "2027-05-12". */
export function fileDay(file: File, today = new Date()): string {
  const date = file.lastModified ? new Date(file.lastModified) : today
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}
