import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { t } from '@/lib/i18n'
import { Button } from './Button'
import { HandNote } from './HandNote'

export type ConfirmOptions = {
  /** The question, in the person's words: « Supprimer ce pommier ? » */
  title: ReactNode
  /** What happens, concretely. */
  body?: ReactNode
  /** The verb on the button: « Supprimer », « Archiver »… (default « Confirmer »). */
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' for what removes or ends something. */
  tone?: 'default' | 'danger'
  /** A handwritten reassurance in the margin, such as « Tu pourras annuler ». */
  note?: string
}

/**
 * The notebook's confirmation: a sheet of paper over the screen, never the
 * browser's grey box. Enter confirms, Escape or a click outside cancels.
 * Controlled; most callers want `confirmAction()` below.
 */
export function ConfirmDialog({ open, onAnswer, title, body, confirmLabel, cancelLabel, tone = 'default', note }: ConfirmOptions & {
  open: boolean
  onAnswer: (confirmed: boolean) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Enter answers yes, as the browser's confirm did.
      dialog.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => { e.preventDefault(); onAnswer(false) }}
      onClick={(e) => { if (e.target === ref.current) onAnswer(false) }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-loam-50 p-0 text-loam-900 shadow-2xl ring-1 ring-loam-900/10 backdrop:bg-loam-950/40 open:animate-[notebook-in_200ms_ease-out] motion-reduce:open:animate-none"
    >
      {open && (
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); onAnswer(true) }} className="px-6 pb-5 pt-6">
          <h2 id="confirm-title" className="font-serif text-xl font-semibold text-prune-800">{title}</h2>
          {body && <div className="mt-2 text-sm leading-relaxed text-loam-600">{body}</div>}
          {note && <HandNote className="mt-3">{note}</HandNote>}
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onAnswer(false)}>{cancelLabel ?? t('common.cancel')}</Button>
            <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'}>
              {confirmLabel ?? t('ui.confirm.ok')}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )
}

let root: Root | null = null
let queue: Promise<unknown> = Promise.resolve()

/**
 * `if (!(await confirmAction({ title, tone: 'danger' }))) return` replaces
 * `if (!confirm(...)) return`. Works from any page, the map editor included:
 * it mounts its own dialog in the browser's top layer.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  // A second question while one is open waits for the first answer.
  const next = queue.then(() => new Promise<boolean>((resolve) => {
    if (!root) {
      const host = document.createElement('div')
      host.dataset.confirmHost = ''
      document.body.appendChild(host)
      root = createRoot(host)
    }
    const answer = (confirmed: boolean) => {
      root?.render(<ConfirmDialog {...options} open={false} onAnswer={() => {}} />)
      resolve(confirmed)
    }
    root.render(<ConfirmDialog {...options} open onAnswer={answer} />)
  }))
  queue = next
  return next
}

/** For a component that prefers state: `const [ask, dialog] = useConfirm()`, render `dialog`. */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const ask = (options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve }))
  const dialog = state && (
    <ConfirmDialog {...state} open onAnswer={(confirmed) => { state.resolve(confirmed); setState(null) }} />
  )
  return [ask, dialog]
}
