import clsx from 'clsx'
import { CircleAlert, Check, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from './Button'

export type ToastTone = 'info' | 'success' | 'error'
export type ToastAction = { label: string; run: () => void }
type Item = { id: number; message: string; tone: ToastTone; action?: ToastAction }

const ICONS = { info: Info, success: Check, error: CircleAlert }
const ICON_TONE = { info: 'text-prune-600', success: 'text-leaf-600', error: 'text-clay-500' }

let push: ((item: Item) => void) | null = null
let mounted = false
// Messages sent before the host has rendered its first time.
const waiting: Item[] = []
let nextId = 1

/**
 * A short message slipped at the bottom of the screen, which leaves on its
 * own: « Pommier supprimé » with « Annuler ». Stays longer when it carries an
 * action, and until dismissed when it is an error.
 */
export function toast(message: string, options: { tone?: ToastTone; action?: ToastAction } = {}) {
  const item = { id: nextId++, message, tone: options.tone ?? 'info', action: options.action }
  if (push) return push(item)
  waiting.push(item)
  if (!mounted) mount()
}

function mount() {
  mounted = true
  const host = document.createElement('div')
  host.dataset.toastHost = ''
  document.body.appendChild(host)
  createRoot(host).render(<Toaster />)
}

function Toaster() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    push = (item) => setItems((list) => [...list.slice(-2), item])
    waiting.splice(0).forEach(push)
    return () => { push = null }
  }, [])
  const dismiss = (id: number) => setItems((list) => list.filter((i) => i.id !== id))
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-16 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-8">
      {items.map((item) => <Slip key={item.id} item={item} onDismiss={() => dismiss(item.id)} />)}
    </div>
  )
}

function Slip({ item, onDismiss }: { item: Item; onDismiss: () => void }) {
  useEffect(() => {
    if (item.tone === 'error' && !item.action) return
    const timer = window.setTimeout(onDismiss, item.action ? 7000 : 4000)
    return () => window.clearTimeout(timer)
  }, [item])
  const Icon = ICONS[item.tone]
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-white py-2 pl-4 pr-2 text-sm text-loam-900 shadow-lg ring-1 ring-loam-900/10',
        'animate-[notebook-in_200ms_ease-out] motion-reduce:animate-none',
      )}
    >
      <Icon className={clsx('h-4 w-4 shrink-0', ICON_TONE[item.tone])} aria-hidden />
      <span className="py-1">{item.message}</span>
      {item.action ? (
        <Button variant="ghost" size="sm" onClick={() => { onDismiss(); item.action?.run() }}>{item.action.label}</Button>
      ) : item.tone === 'error' && (
        <Button variant="ghost" size="sm" onClick={onDismiss}>OK</Button>
      )}
    </div>
  )
}
