import { Keyboard } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { t } from '@/lib/i18n'
import { isTextTarget } from '@/map/editor/history'
import { commandKey, isShortcutsKey, SHORTCUT_GROUPS } from '@/map/shortcuts/keys'

const OPEN_EVENT = 'terranova:shortcuts'

function keyLabel(key: string): string {
  if (key === 'cmd') return commandKey(typeof navigator === 'undefined' ? '' : navigator.platform)
  return t(`editor.shortcuts.keys.${key}`)
}

/**
 * The keyboard sheet of the editor: « ? » opens it from anywhere on the map,
 * and the keyboard button of the header too. Keys already work without it;
 * the sheet only makes them known.
 */
export default function ShortcutsSheet() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isShortcutsKey(event) || event.defaultPrevented || isTextTarget(event.target)) return
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      setOpen(true)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title={t('editor.shortcuts.title')}>
      <div className="space-y-5">
        <p className="text-sm text-loam-600">{t('editor.shortcuts.intro')}</p>
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.key}>
            <h3 className="mb-2 font-sans text-sm font-semibold text-loam-900">{t(`editor.shortcuts.groups.${group.key}`)}</h3>
            <dl className="divide-y divide-loam-100">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                  <dt className="text-loam-700">{t(`editor.shortcuts.rows.${row.label}`)}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {row.keys.map((key, index) => (
                      <Fragment key={key}>
                        {index > 0 && <span aria-hidden className="text-loam-400">+</span>}
                        <kbd className="min-w-7 rounded-md border border-loam-200 bg-loam-50 px-1.5 py-0.5 text-center font-sans text-sm text-loam-800">{keyLabel(key)}</kbd>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}

/** The keyboard button of the header (computers only: a phone has no keys). */
export function ShortcutsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      title={t('editor.shortcuts.button')}
      aria-label={t('editor.shortcuts.button')}
      className="hidden rounded-full p-1.5 text-loam-500 hover:bg-loam-100 hover:text-loam-900 focus-visible:outline-2 focus-visible:outline-prune-600 md:inline-flex"
    >
      <Keyboard className="h-[18px] w-[18px]" aria-hidden />
    </button>
  )
}
