import { Download, RefreshCw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '@/collab/time'
import { HelpButton } from '@/components/help/HelpButton'
import { Button, buttonClass } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { formatBytes } from '@/lib/money'

type Status = {
  status: 'none' | 'pending' | 'building' | 'ready' | 'failed'
  includeNetworks?: boolean
  finishedAt?: string | null
  byteSize?: number | null
  summary?: { photos?: number; videos?: number; documents?: number; skipped?: unknown[] }
  canIncludeNetworks: boolean
}

const POLL_MS = 4000

/**
 * « Site hors ligne »: the map packed as a website that opens without
 * Terranova (MapOfflineSite). The build runs on the server; the dialog
 * follows it and offers the download once ready.
 */
export function OfflineSiteDialog({ mapId, onClose }: { mapId: number; onClose: () => void }) {
  const [state, setState] = useState<Status | null>(null)
  const [networks, setNetworks] = useState(false)
  const [error, setError] = useState(false)
  const path = `/maps/${mapId}/offline_site`
  const working = state?.status === 'pending' || state?.status === 'building'

  const load = useCallback(() => {
    api<Status>(path).then((next) => { setState(next); setError(false) }, () => setError(true))
  }, [path])

  useEffect(load, [load])
  useEffect(() => {
    if (!working) return
    const timer = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(timer)
  }, [working, load])

  const prepare = () => {
    api<Status>(path, { method: 'POST', body: { networks: networks ? '1' : '0' } })
      .then((next) => { setState(next); setError(false) }, () => setError(true))
  }

  const ready = state?.status === 'ready'
  const summary = state?.summary ?? {}
  const skipped = summary.skipped?.length ?? 0

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('offline_site.dialog.title')}
      footer={
        <>
          {ready && (
            <Button variant="secondary" onClick={prepare}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('offline_site.dialog.prepare_again')}
            </Button>
          )}
          {ready ? (
            <a href={`${path}/download`} className={buttonClass('primary')}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t('offline_site.dialog.download', { size: formatBytes(state.byteSize ?? 0) })}
            </a>
          ) : (
            <Button onClick={prepare} disabled={!state || working}>
              {t(state?.status === 'failed' ? 'offline_site.dialog.prepare_again' : 'offline_site.dialog.prepare')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm text-loam-700">
        <p>{t('offline_site.dialog.intro')}</p>
        <HelpButton compact slug="emporter-sa-carte-hors-ligne" />
        {state?.canIncludeNetworks && !working && (
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={networks} onChange={(e) => setNetworks(e.target.checked)} className="mt-0.5 rounded border-loam-300 text-prune-700" />
            <span>
              {t('offline_site.dialog.networks')}
              <span className="block text-loam-500">{t('offline_site.dialog.networks_hint')}</span>
            </span>
          </label>
        )}
        {working && <p className="rounded-xl bg-loam-50 p-3 text-loam-600" role="status">{t('offline_site.dialog.preparing')}</p>}
        {ready && (
          <div className="rounded-xl bg-leaf-50 p-3 text-loam-700" role="status">
            <p className="font-medium text-loam-900">{t('offline_site.dialog.ready', { date: formatDate(state.finishedAt ?? new Date().toISOString()) })}</p>
            <p>{t('offline_site.dialog.contents', { photos: (summary.photos ?? 0) + (summary.videos ?? 0), documents: summary.documents ?? 0 })}</p>
            {state.includeNetworks && (
              <p className="mt-1 flex items-center gap-1.5 text-humus-800"><ShieldAlert className="h-4 w-4" aria-hidden="true" />{t('offline_site.dialog.with_networks')}</p>
            )}
            {skipped > 0 && <p className="mt-1 text-loam-600">{t('offline_site.dialog.skipped', { count: skipped })}</p>}
            <p className="mt-1 text-loam-600">{t('offline_site.dialog.how')}</p>
          </div>
        )}
        {state?.status === 'failed' && <p className="rounded-xl bg-clay-50 p-3 text-clay-800" role="alert">{t('offline_site.dialog.failed')}</p>}
        {error && <p className="text-clay-700" role="alert">{t('offline_site.dialog.error')}</p>}
      </div>
    </Dialog>
  )
}
