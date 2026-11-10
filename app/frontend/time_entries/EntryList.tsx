import { Link } from '@inertiajs/react'
import { Car, Lock, Pencil, Smartphone, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Pill } from '@/components/ui/Pill'
import { confirmAction } from '@/components/ui/confirm'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { EntryForm } from './EntryForm'
import { formatDate, formatDay, formatDuration } from './format'
import type { Catalog, ProjectChoice, TimeEntry } from './types'

type Props = {
  entries: TimeEntry[]
  /** Who is reading: only their own entries can change. */
  userId: number
  /** Show the project of each line (« Mes heures »), or the person (a project's page). */
  show: 'project' | 'person'
  projects: ProjectChoice[]
  catalog: Catalog
  billToSuggestions: string[]
  today: string
  onChanged: () => void
}

/** The noted hours, newest first: one line each, with its trip and its state. */
export function EntryList({ entries, userId, show, projects, catalog, billToSuggestions, today, onChanged }: Props) {
  const [editing, setEditing] = useState<TimeEntry | null>(null)

  async function remove(entry: TimeEntry) {
    const project = entry.mapName ?? projects.find((p) => p.id === entry.mapId)?.name ?? ''
    const ok = await confirmAction({
      title: t('time_entries.entry.delete_title'),
      body: t('time_entries.entry.delete_body', { duration: formatDuration(entry.minutes), date: formatDate(entry.workedOn), project }),
      confirmLabel: t('time_entries.entry.delete'),
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api(`/time_entries/${entry.id}`, { method: 'DELETE' })
      toast(t('time_entries.entry.deleted'))
      onChanged()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    }
  }

  return (
    <>
      <ul className="divide-y divide-loam-900/5">
        {entries.map((entry) => {
          const mine = entry.userId === userId
          const editable = mine && entry.status === 'noted' && projects.some((p) => p.id === entry.mapId)
          return (
            <li key={entry.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1 sm:flex sm:gap-3">
              <div className="shrink-0 text-sm capitalize text-loam-500 sm:w-24 sm:pt-0.5">{formatDay(entry.workedOn)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug text-loam-900">
                  <span className="font-semibold tabular-nums">{formatDuration(entry.minutes)}</span>
                  <span className="text-loam-500"> · </span>
                  {show === 'project'
                    ? <Link href={`/maps/${entry.mapId}/time_entries`} className="hover:text-prune-800 hover:underline">{entry.mapName}</Link>
                    : <span>{entry.userName}</span>}
                  <span className="text-loam-500"> · {t(`time_entries.phases.${entry.phase}`)}</span>
                </p>
                {entry.note && <p className="mt-0.5 text-sm text-loam-600">{entry.note}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {!entry.billable && <Pill tone="humus">{t(`time_entries.reasons.${entry.nonBillableReason ?? 'other'}`)}</Pill>}
                  {entry.tripKm != null && <Pill icon={<Car aria-hidden />}>{t('time_entries.entry.trip', { km: formatNumber(entry.tripKm) })}</Pill>}
                  {entry.status === 'invoiced'
                    ? <Pill tone="leaf" icon={<Lock aria-hidden />}>{t('time_entries.statuses.invoiced')}{entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ''}</Pill>
                    : entry.billable && <Pill tone="prune">{t('time_entries.statuses.noted')}</Pill>}
                  {entry.billTo && show === 'project' && <span className="text-sm text-loam-500">{entry.billTo}</span>}
                  {entry.source === 'mcp' && <span className="inline-flex items-center gap-1 text-sm text-loam-500"><Sparkles className="h-3.5 w-3.5" aria-hidden />{t('time_entries.entry.by_ai')}</span>}
                  {entry.source === 'app' && <span className="inline-flex items-center gap-1 text-sm text-loam-500"><Smartphone className="h-3.5 w-3.5" aria-hidden />{t('time_entries.entry.by_app')}</span>}
                </div>
              </div>
              </div>
              {editable && (
                <div className="flex shrink-0 gap-0.5">
                  <IconButton size="sm" label={t('time_entries.entry.edit')} onClick={() => setEditing(entry)}><Pencil /></IconButton>
                  <IconButton size="sm" tone="danger" label={t('time_entries.entry.delete')} onClick={() => void remove(entry)}><Trash2 /></IconButton>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog open={editing != null} onClose={() => setEditing(null)} title={t('time_entries.form.edit_title')} dismissOnBackdrop={false}>
        {editing && (
          <EntryForm
            projects={projects}
            catalog={catalog}
            billToSuggestions={billToSuggestions}
            today={today}
            entry={editing}
            onDone={() => { setEditing(null); onChanged() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  )
}
