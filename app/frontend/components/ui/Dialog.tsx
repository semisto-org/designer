import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '@/lib/i18n'

/**
 * A modal built on the native <dialog>: focus is trapped, Escape closes,
 * the page behind is inert. Rendered in the browser's top layer, so it
 * works from inside the map editor without z-index fights.
 */
export function Dialog({ open, onClose, title, children, footer, dismissOnBackdrop = true }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Turn off for forms: a stray click outside must not throw the answers away. */
  dismissOnBackdrop?: boolean
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
      onClick={(e) => { if (dismissOnBackdrop && e.target === ref.current) onClose() }}
      className="m-auto w-[min(40rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] rounded-2xl bg-white p-0 text-loam-900 shadow-2xl backdrop:bg-loam-950/50 open:flex open:flex-col"
    >
      {open && (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-loam-100 px-5 py-4">
            <h2 className="text-lg">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-loam-500 hover:bg-loam-100" aria-label={t('common.close')}>
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-loam-100 px-5 py-3">{footer}</footer>}
        </>
      )}
    </dialog>
  )
}
