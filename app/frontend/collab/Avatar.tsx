import clsx from 'clsx'
import { Sparkles } from 'lucide-react'

/**
 * A person's picture, or their initial on a prune disc. `agent`: the team's
 * AI colleague (« Collègue IA »), a sparkle on a leaf disc, or the picture
 * her team chose, ringed in leaf green with the sparkle in its corner: never
 * mistaken for a person.
 */
export function Avatar({ name, url, className, agent }: { name: string; url?: string | null; className?: string; agent?: boolean }) {
  if (agent && url) {
    return (
      <span aria-hidden="true" className={clsx('relative inline-block shrink-0', className ?? 'h-7 w-7')}>
        <img src={url} alt="" className="h-full w-full rounded-full object-cover ring-2 ring-leaf-300" />
        <span className="absolute -bottom-0.5 -right-0.5 grid h-[45%] w-[45%] place-items-center rounded-full bg-leaf-100 text-leaf-800 ring-1 ring-white">
          <Sparkles className="h-3/4 w-3/4" />
        </span>
      </span>
    )
  }
  if (agent) {
    return (
      <span aria-hidden="true" className={clsx('grid shrink-0 place-items-center rounded-full bg-leaf-100 text-leaf-800', className ?? 'h-7 w-7')}>
        <Sparkles className="h-1/2 w-1/2" />
      </span>
    )
  }
  if (url) return <img src={url} alt="" referrerPolicy="no-referrer" className={clsx('shrink-0 rounded-full object-cover', className ?? 'h-7 w-7')} />
  return (
    <span aria-hidden="true" className={clsx('grid shrink-0 place-items-center rounded-full bg-prune-100 text-xs font-semibold text-prune-700', className ?? 'h-7 w-7')}>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  )
}
