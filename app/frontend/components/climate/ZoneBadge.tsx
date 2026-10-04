import clsx from 'clsx'

/** A USDA hardiness zone code ("7b") as a badge; `tone` warm for projections. */
export function ZoneBadge({ code, tone = 'current', size = 'md' }: { code: string; tone?: 'current' | 'future'; size?: 'md' | 'lg' }) {
  return (
    <span
      className={clsx(
        'inline-grid shrink-0 place-items-center rounded-lg font-semibold tabular-nums',
        size === 'lg' ? 'h-14 w-14 text-2xl' : 'h-9 w-9 text-base',
        tone === 'current' ? 'bg-prune-600 text-white' : 'bg-humus-100 text-humus-700 ring-1 ring-inset ring-humus-200',
      )}
    >
      {code}
    </span>
  )
}
