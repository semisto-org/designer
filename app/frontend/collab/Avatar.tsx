import clsx from 'clsx'
import { Sparkles } from 'lucide-react'

/**
 * A person's picture, or their initial on a prune disc. `agent`: the team's
 * AI colleague (« Collègue IA »), a sparkle on a leaf disc, never mistaken
 * for a person.
 */
export function Avatar({ name, url, className, agent }: { name: string; url?: string | null; className?: string; agent?: boolean }) {
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
