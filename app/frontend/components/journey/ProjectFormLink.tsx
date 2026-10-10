import clsx from 'clsx'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { CopyField } from '@/components/CopyField'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { ProjectFormLink as Link } from '@/types/journey'

/**
 * The private link editors send to the people behind the project: it opens
 * the sheet's form only, without an account or the map. Create, copy,
 * reset (new address) or switch off; shows whether it was opened and sent.
 */
export function ProjectFormLink({ mapId, initial, className }: { mapId: number; initial: Link | null; className?: string }) {
  const [link, setLink] = useState<Link | null>(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const endpoint = `/maps/${mapId}/project/link`

  async function run(method: 'POST' | 'DELETE', path = '', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setFailed(false)
    try {
      const result = await api<{ formLink: Link }>(endpoint + path, { method })
      setLink(result.formLink)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const enabled = link?.enabled ?? false
  const status = link?.submittedAt
    ? t('journey.link.submitted', { when: relativeTime(link.submittedAt) })
    : link?.openedAt ? t('journey.link.opened', { when: relativeTime(link.openedAt) }) : t('journey.link.not_opened')

  return (
    <section className={clsx('rounded-2xl bg-white p-4 ring-1 ring-loam-200', className)} aria-labelledby="project-form-link-title">
      <h3 id="project-form-link-title" className="flex items-center gap-1.5 text-sm font-semibold text-loam-900">
        <Send className="h-4 w-4 text-prune-600" aria-hidden />{t('journey.link.title')}
      </h3>
      <p className="mt-1 text-sm text-loam-600">{t('journey.link.intro')}</p>
      {link && enabled ? (
        <>
          <CopyField value={link.url} className="mt-3" />
          <p className={clsx('mt-2 text-xs', link.submittedAt ? 'font-medium text-leaf-700' : 'text-loam-500')}>{status}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run('POST', '/reset', t('journey.link.confirm_reset'))}>
              {t('journey.link.reset')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run('DELETE', '', t('journey.link.confirm_disable'))}>
              {t('journey.link.disable')}
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          {link && <p className="mb-2 text-xs text-humus-700">{t('journey.link.disabled')}</p>}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run('POST')}>
            {t(link ? 'journey.link.enable' : 'journey.link.create')}
          </Button>
        </div>
      )}
      {failed && <p className="mt-2 text-xs text-clay-600">{t('journey.link.error')}</p>}
    </section>
  )
}
