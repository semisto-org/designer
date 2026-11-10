import clsx from 'clsx'

/**
 * Two or three exclusive choices side by side, the chosen one raised like
 * a slip of paper (« Facturable » / « Pas facturable »). A radio group for
 * assistive technology.
 */
export function Segmented<T extends string>({ value, options, onChange, label, className }: {
  value: T
  options: { value: T; label: string; tone?: 'leaf' | 'humus' }[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div className={clsx('inline-grid grid-flow-col auto-cols-fr gap-1 rounded-full bg-loam-100 p-1', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
              on ? 'bg-white font-medium shadow-sm ring-1 ring-loam-900/5' : 'text-loam-600 hover:text-loam-900',
              on && (o.tone === 'humus' ? 'text-humus-800' : o.tone === 'leaf' ? 'text-leaf-800' : 'text-loam-900'),
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
