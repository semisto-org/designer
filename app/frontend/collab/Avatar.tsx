import clsx from 'clsx'

/** A person's picture, or their initial on a prune disc. */
export function Avatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  if (url) return <img src={url} alt="" referrerPolicy="no-referrer" className={clsx('shrink-0 rounded-full object-cover', className ?? 'h-7 w-7')} />
  return (
    <span aria-hidden="true" className={clsx('grid shrink-0 place-items-center rounded-full bg-prune-100 text-xs font-semibold text-prune-700', className ?? 'h-7 w-7')}>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  )
}
