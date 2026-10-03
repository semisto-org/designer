import { Hammer, HeartHandshake, ShoppingBasket, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { requestJourneyRefresh } from '@/lib/journeyFlags'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { useEditor } from '@/map/editor/EditorContext'
import { RequestDialog } from '@/map/panels/RequestDialog'
import type { RequestKind, RequestsData } from '@/types/journey'

const KINDS: { kind: RequestKind; icon: LucideIcon }[] = [
  { kind: 'order_plants', icon: ShoppingBasket },
  { kind: 'implementation', icon: Hammer },
  { kind: 'co_management', icon: HeartHandshake },
]

const STATUS_STYLES = {
  new: 'bg-prune-100 text-prune-700',
  contacted: 'bg-humus-100 text-humus-700',
  closed: 'bg-loam-100 text-loam-600',
} as const

/** "Passer à l'action": plants from the Semisto nursery, implementation on quote, co-management. */
export default function ActionsPanel() {
  const editor = useEditor()
  const [data, setData] = useState<RequestsData | null>(null)
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState<RequestKind | null>(null)

  const load = useCallback(() => {
    api<RequestsData>(`/maps/${editor.map.id}/requests`).then(setData).catch(() => setFailed(true))
  }, [editor.map.id])
  useEffect(load, [load])

  if (failed) return <p className="text-sm text-clay-600">{t('journey.requests.unavailable')}</p>
  if (!data) return <p className="text-sm text-loam-500">{t('common.loading')}</p>

  const canCreate = data.canCreate && data.schema != null && data.prefill != null
  const hasOpen = data.requests.some((r) => r.status !== 'closed')

  return (
    <div className="space-y-5">
      <p className="text-sm text-loam-600">{t('journey.requests.intro')}</p>
      <ul className="space-y-3">
        {KINDS.map(({ kind: k, icon: Icon }) => (
          <li key={k} className="rounded-xl p-3.5 ring-1 ring-loam-200">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-600"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-loam-900">{t(`journey.requests.kinds.${k}.title`)}</h3>
                <p className="mt-0.5 text-xs text-loam-500">{t(`journey.requests.kinds.${k}.summary`)}</p>
              </div>
            </div>
            {canCreate && (
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setKind(k)}>
                {t('journey.requests.cta')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!data.canCreate && <p className="text-xs text-loam-500">{t('journey.requests.owner_only')}</p>}

      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-loam-500">{t('journey.requests.list_title')}</h3>
        {data.requests.length === 0 ? (
          <p className="text-sm text-loam-500">{t('journey.requests.list_empty')}</p>
        ) : (
          <ul className="divide-y divide-loam-100">
            {data.requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block leading-snug text-loam-800">{t(`journey.requests.kinds.${r.kind}.title`)}</span>
                  <span className="block text-xs text-loam-500">{relativeTime(r.createdAt)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                  {t(`journey.requests.status.${r.status}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hasOpen && <p className="mt-2 text-xs text-loam-500">{t('journey.requests.staff_notice')}</p>}
      </section>

      {canCreate && (
        <RequestDialog
          mapId={editor.map.id} kind={kind} schema={data.schema!} prefill={data.prefill!}
          onClose={() => setKind(null)}
          onSent={(next) => {
            setData((current) => ({ ...(current as RequestsData), ...next }))
            setKind(null)
            editor.notify(t('journey.requests.sent'))
            requestJourneyRefresh()
          }}
        />
      )}
    </div>
  )
}
