import { router } from '@inertiajs/react'
import clsx from 'clsx'
import { Bot, ExternalLink, FileText, MapPin, Pencil, Snowflake, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Pill } from '@/components/ui/Pill'
import { Tooltip } from '@/components/ui/Tooltip'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { TerritoryItem } from '@/types/territories'
import { UpdateReview } from './UpdateReview'

const v = (group: string, key: string) => t(`territories.show.values.${group}.${key}`)
const date = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDate(iso) : iso)

/** One entry of the dossier, as read; a draft from the AI carries its reason and the two choices. */
export function ItemCard({ item, territoryId, canEdit, selected, onEdit, onSelect, titles, review = false }: {
  item: TerritoryItem
  territoryId: number
  canEdit: boolean
  selected: boolean
  onEdit: () => void
  onSelect: () => void
  /** Titles of the other entries, by id (sources, expectations). */
  titles: Map<number, string>
  /** Shows the change an AI proposed to this entry, to accept field by field. */
  review?: boolean
}) {
  const p = item.properties
  const base = `/territories/${territoryId}/items/${item.id}`
  const decide = (action: 'accept' | 'reject') => router.post(`${base}/${action}`, { tab: item.kind }, { preserveScroll: true })
  const remove = async () => {
    if (await confirmAction({ title: t('territories.show.delete_confirm', { title: item.title }), confirmLabel: t('territories.show.delete'), tone: 'danger' })) {
      router.delete(base, { data: { tab: item.kind }, preserveScroll: true })
    }
  }
  const refs = (ids?: number[]) => (ids ?? []).map((id) => titles.get(id)).filter(Boolean).join(' · ')

  const lines: ReactNode[] = []
  const line = (label: string, value: ReactNode) => value ? lines.push(<p key={label}><span className="text-loam-500">{label} : </span>{value}</p>) : null
  const fl = (key: string) => t(`territories.show.fields.${key}`)
  switch (item.kind) {
    case 'actor':
      line(fl('organization'), p.organization)
      line(fl('function'), p.function)
      line(fl('met_on'), date(p.met_on))
      line(fl('contact'), p.contact)
      break
    case 'source':
      line(fl('author'), p.author)
      line(fl('published_on'), date(p.published_on))
      line(fl('source_kind'), p.source_kind && v('source_kind', p.source_kind))
      line(fl('rights'), v('rights', p.rights ?? 'unknown'))
      break
    case 'expectation':
      line(fl('year'), p.year)
      line(fl('source_ids'), refs(p.source_ids))
      break
    case 'basin':
      line(fl('outlet'), p.outlet)
      break
    case 'marker':
      line(fl('basin_id'), p.basin_id ? titles.get(p.basin_id) : null)
      line(fl('marker_kind'), p.marker_kind && v('marker_kind', p.marker_kind))
      line(fl('occurred_on'), date(p.occurred_on))
      line(fl('source_ids'), refs(p.source_ids))
      break
    case 'lead':
      line(fl('basin_id'), p.basin_id ? titles.get(p.basin_id) : null)
      line(fl('magnitude'), p.magnitude)
      line(fl('expectation_ids'), refs(p.expectation_ids))
      line(fl('farmer'), p.farmer?.answer ? `${v('farmer_answer', p.farmer.answer)}${p.farmer.contacted_on ? `, ${date(p.farmer.contacted_on)}` : ''}${p.farmer.note ? ` (${p.farmer.note})` : ''}` : null)
      line(fl('keeper'), p.keeper?.role ? [p.keeper.role, p.keeper.hours_per_year != null ? `${p.keeper.hours_per_year} h/an` : null, p.keeper.lifespan_years ? `${p.keeper.lifespan_years} ans` : null].filter(Boolean).join(' · ') : null)
      line(fl('decision'), p.decision?.status ? `${v('decision', p.decision.status)}${p.decision.reason ? `, ${p.decision.reason}` : ''}${p.decision.decided_on ? ` (${date(p.decision.decided_on)})` : ''}` : null)
      line(fl('first_step'), p.first_step ? v('first_step', String(p.first_step)) : null)
      break
    case 'request':
      line(fl('request_kind'), p.request_kind && v('request_kind', p.request_kind))
      line(fl('from'), p.from)
      line(fl('actor_id'), p.actor_id ? titles.get(p.actor_id) : null)
      line(fl('asked_on'), date(p.asked_on))
      line(fl('received_on'), date(p.received_on))
      line(fl('source_id'), p.source_id ? titles.get(p.source_id) : null)
      break
  }
  const excerpts = Array.isArray(p.excerpts) ? p.excerpts : typeof p.excerpts === 'string' ? [p.excerpts] : []

  return (
    <li
      id={`item-${item.id}`}
      className={clsx('min-w-0 break-words rounded-2xl bg-white p-4 ring-1 transition [overflow-wrap:anywhere]', selected ? 'ring-2 ring-prune-500' : 'ring-loam-200', item.status === 'draft' && 'bg-humus-50/60 ring-humus-200')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-loam-900">{item.title}</span>
            {item.kind === 'basin' && p.order && <Pill tone="lichen">{t('territories.show.badges.basin_order', { order: p.order })}</Pill>}
            {item.kind === 'request' && (
              <Pill tone={p.state === 'received' ? 'leaf' : p.state === 'refused' ? 'clay' : p.state === 'asked' ? 'lichen' : 'humus'}>{v('request_state', p.state ?? 'to_ask')}</Pill>
            )}
            {item.pendingUpdate && !review && <Pill tone="humus" icon={<Bot aria-hidden />}>{t('territories.show.updates.pending')}</Pill>}
            {item.kind === 'marker' && (
              <Pill tone={p.proof === 'confirmed' ? 'prune' : p.proof === 'seen' ? 'leaf' : 'humus'}>{v('proof', p.proof ?? 'computed')}</Pill>
            )}
            {item.kind === 'marker' && (p.proof ?? 'computed') === 'computed' && <Pill tone="humus">{t('territories.show.badges.concordance')}</Pill>}
            {item.kind === 'lead' && p.rank && <Pill tone="lichen">{v('rank_short', p.rank)}</Pill>}
            {item.kind === 'lead' && p.land && <Pill>{v('land', p.land)}</Pill>}
            {item.kind === 'lead' && !p.seen_on_site && <Pill tone="humus">{t('territories.show.badges.hypothesis')}</Pill>}
            {item.orphan && (
              <Tooltip content={t('territories.show.badges.orphan_why')}>
                <span><Pill tone="clay">{t('territories.show.badges.orphan')}</Pill></span>
              </Tooltip>
            )}
            {item.waitingForFarmer && (
              <Tooltip content={t('territories.show.badges.waiting_farmer_why')}>
                <span><Pill tone="humus">{t('territories.show.badges.waiting_farmer')}</Pill></span>
              </Tooltip>
            )}
            {p.this_winter && <Pill tone="leaf" icon={<Snowflake aria-hidden />}>{t('territories.show.badges.this_winter')}</Pill>}
            {item.source === 'ai' && item.status !== 'draft' && <Pill icon={<Bot aria-hidden />}>{t('territories.show.from_ai')}</Pill>}
          </p>
          {item.kind === 'source' && p.url && (
            <a href={p.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-prune-700 hover:underline">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{p.url.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
          {item.file && (
            <a href={`/territories/${territoryId}/items/${item.id}/file`} className="mt-1 flex items-center gap-1 text-sm text-prune-700 hover:underline">
              <FileText className="h-3.5 w-3.5" aria-hidden />{item.file.name}
            </a>
          )}
          {item.body && <p className="mt-2 whitespace-pre-line text-sm text-loam-700">{item.body}</p>}
          {item.kind === 'source' && excerpts.map((excerpt, i) => (
            <blockquote key={i} className="mt-2 border-l-2 border-loam-300 pl-3 text-sm text-loam-600">{excerpt}</blockquote>
          ))}
          {lines.length > 0 && <div className="mt-2 grid gap-0.5 text-sm text-loam-700">{lines}</div>}
          {item.status === 'draft' && item.rationale && (
            <p className="mt-2 rounded-lg bg-white/80 p-2 text-sm text-loam-700 ring-1 ring-humus-200">
              <span className="font-medium text-humus-800">{t('territories.show.drafts.rationale')} : </span>{item.rationale}
            </p>
          )}
        </div>
        {item.geometry && (
          <Tooltip content={t('territories.show.placed')}>
            <Button size="sm" variant="ghost" onClick={onSelect} aria-label={t('territories.show.placed')}><MapPin className="h-4 w-4" aria-hidden /></Button>
          </Tooltip>
        )}
      </div>
      {review && item.pendingUpdate && <UpdateReview item={item} update={item.pendingUpdate} territoryId={territoryId} canEdit={canEdit} titles={titles} />}
      {canEdit && !review && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {item.status === 'draft' ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => decide('reject')}>{t('territories.show.drafts.reject')}</Button>
              <Button size="sm" variant="secondary" onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden />{t('territories.show.edit')}</Button>
              <Button size="sm" onClick={() => decide('accept')}>{t('territories.show.drafts.accept')}</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4" aria-hidden />{t('territories.show.delete')}</Button>
              <Button size="sm" variant="secondary" onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden />{t('territories.show.edit')}</Button>
            </>
          )}
        </div>
      )}
    </li>
  )
}
