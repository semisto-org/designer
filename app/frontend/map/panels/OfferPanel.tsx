import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { euros } from '@/components/offers/shared'
import { buttonClass } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { OfferVersionSummary } from '@/types/offers'

type Summary = {
  offer: { persisted: boolean; updatedAt: string | null }
  totals: { total_tvac: number; total_max_tvac: number }
  versions: OfferVersionSummary[]
}

/** « Offre »: the current total and the latest version, and a way in. */
export default function OfferPanel() {
  const editor = useEditor()
  const [data, setData] = useState<Summary | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    api<Summary>(`/maps/${editor.map.id}/offer`, { signal: controller.signal })
      .then(setData)
      .catch(() => setUnavailable(true))
    return () => controller.abort()
  }, [editor.map.id])

  const latest = data?.versions.reduce<OfferVersionSummary | null>((best, version) => (!best || version.number > best.number ? version : best), null)

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('offers.panel.intro')}</p>
      {unavailable && <p className="text-xs text-loam-500">{t('offers.panel.unavailable')}</p>}
      {data && !data.offer.persisted && <p className="text-xs text-loam-500">{t('offers.panel.not_started')}</p>}
      {data?.offer.persisted && (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-loam-50 px-2.5 py-2">
            <dt className="text-[11px] leading-tight text-loam-500">{t('offers.panel.total')}</dt>
            <dd className="font-medium text-loam-900">{euros(data.totals.total_tvac)}</dd>
          </div>
          <div className="rounded-lg bg-loam-50 px-2.5 py-2">
            <dt className="text-[11px] leading-tight text-loam-500">{t('offers.panel.latest')}</dt>
            <dd className="font-medium text-loam-900">{latest ? `${latest.label} · ${t(`offers.statuses.${latest.status}`)}` : '—'}</dd>
          </div>
        </dl>
      )}
      <Link href={`/maps/${editor.map.id}/offer`} className={buttonClass('primary', 'md', 'w-full')}>
        {t('offers.panel.open')}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
