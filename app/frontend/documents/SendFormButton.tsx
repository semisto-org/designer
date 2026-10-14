import { Link } from '@inertiajs/react'
import { MessageSquareText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CopyField } from '@/components/CopyField'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { MapFormLink } from '@/types/forms'

/**
 * « Envoyer un formulaire »: the team's Tally forms, each with its link
 * already filled for this map, to copy into an e-mail to the client.
 */
export function SendFormButton({ forms, teamId }: { forms: MapFormLink[]; teamId: number | null }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MessageSquareText className="h-4 w-4" />{t('forms.send.button')}
      </Button>
      {open && (
        <div role="dialog" aria-label={t('forms.send.title')}
          className="absolute left-0 z-30 mt-2 w-[min(26rem,calc(100vw-2rem))] sm:left-auto sm:right-0 rounded-2xl bg-white p-4 text-left shadow-lg ring-1 ring-loam-900/10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-serif text-xl text-loam-900">{t('forms.send.title')}</p>
              <p className="mt-0.5 text-sm text-loam-600">{t('forms.send.hint')}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-loam-400 hover:bg-loam-100" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-3 space-y-3">
            {forms.map((form) => (
              <li key={form.id}>
                <p className="mb-1 text-sm font-medium text-loam-800">{form.name}</p>
                <CopyField value={form.link} />
              </li>
            ))}
          </ul>
          {teamId != null && (
            <Link href={`/teams/${teamId}/forms`} className="mt-3 inline-block text-sm text-prune-700 hover:underline">{t('forms.send.manage')}</Link>
          )}
        </div>
      )}
    </div>
  )
}
