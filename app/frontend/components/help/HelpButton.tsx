import clsx from 'clsx'
import { CircleHelp } from 'lucide-react'
import { useCallback, useState } from 'react'
import { HelpDrawer } from '@/components/help/HelpDrawer'
import { t } from '@/lib/i18n'

/**
 * "Aide" button that opens a help article in a side drawer. Drop it next to
 * any screen that needs contextual help:
 *
 *   <HelpButton slug="partager-et-commenter" />
 *
 * Without a slug the drawer opens on the list of guides, with search.
 */
export function HelpButton({ slug, label, className, iconOnly, compact }: { slug?: string; label?: string; className?: string; iconOnly?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const text = label ?? t('help.drawer.open')
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={iconOnly || compact ? text : undefined}
        title={iconOnly || compact ? text : undefined}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-loam-600 transition-colors hover:bg-loam-100 hover:text-loam-900',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
          className,
        )}
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
        {!iconOnly && <span className={compact ? 'hidden sm:inline' : undefined}>{text}</span>}
      </button>
      <HelpDrawer open={open} slug={slug} onClose={close} />
    </>
  )
}
