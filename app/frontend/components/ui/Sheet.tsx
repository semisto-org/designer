import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { IconButton } from './IconButton'

/**
 * A page of the notebook slid over the screen: from the bottom on a phone
 * (within thumb reach, with a handle), from the right on a computer. For a
 * detail or a short task that keeps the screen behind in view.
 */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={clsx(
        'm-0 max-h-none max-w-none bg-loam-50 p-0 text-loam-900 shadow-2xl backdrop:bg-loam-950/40 open:flex open:flex-col',
        // Phone: a bottom sheet. Computer: a side page.
        'inset-x-0 bottom-0 top-auto max-h-[85dvh] w-full rounded-t-2xl',
        'md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-dvh md:w-[28rem] md:rounded-l-2xl md:rounded-tr-none',
        'open:animate-[sheet-up_220ms_ease-out] md:open:animate-[sheet-left_220ms_ease-out] motion-reduce:open:animate-none',
      )}
    >
      {open && (
        <>
          <span aria-hidden className="mx-auto mt-2 block h-1.5 w-10 rounded-full bg-loam-300 md:hidden" />
          <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-3 md:pt-5">
            <h2 className="font-serif text-xl font-semibold text-prune-800">{title}</h2>
            <IconButton label={t('common.close')} size="sm" onClick={onClose}><X /></IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-loam-200 px-5 py-3">{footer}</footer>}
        </>
      )}
    </dialog>
  )
}
