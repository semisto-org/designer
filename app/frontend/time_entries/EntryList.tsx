import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowDownToLine, Lock, Pencil, Smartphone, Sparkles, Trash2 } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Pill } from '@/components/ui/Pill'
import { Tooltip } from '@/components/ui/Tooltip'
import { confirmAction } from '@/components/ui/confirm'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { EntryForm } from './EntryForm'
import { formatDate, formatDay, formatDuration, formatKm, formatMonth, readableName } from './format'
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
  /** Break the list by month, with each month's total (a project's page). */
  byMonth?: boolean
}

// A ledger: day, who (or which project), what was done, km, hours. The
// columns line up from one line to the next so a month reads at a glance;
// on a phone each line folds to two rows.
const COLS = 'sm:grid-cols-[6.5rem_9rem_minmax(0,1fr)_4rem_4.5rem]'
const COLS_WITH_ACTIONS = 'sm:grid-cols-[6.5rem_9rem_minmax(0,1fr)_4rem_4.5rem_4rem]'

const AREAS = 'sm:[grid-template-areas:"day_who_note_km_hours"]'
const AREAS_WITH_ACTIONS = 'sm:[grid-template-areas:"day_who_note_km_hours_acts"]'

const SOURCE_ICONS = {
  mcp: { Icon: Sparkles, label: 'by_ai' },
  app: { Icon: Smartphone, label: 'by_app' },
  import: { Icon: ArrowDownToLine, label: 'imported' },
  web: null,
} as const

/** The noted hours, newest first: one line each, with its trip and its state. */
export function EntryList({ entries, userId, show, projects, catalog, billToSuggestions, today, onChanged, byMonth = false }: Props) {
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const months = useMemo(() => {
    const groups: { month: string; minutes: number; km: number; entries: TimeEntry[] }[] = []
    for (const entry of entries) {
      const month = byMonth ? entry.workedOn.slice(0, 7) : ''
      let group = groups.find((g) => g.month === month)
      if (!group) groups.push((group = { month, minutes: 0, km: 0, entries: [] }))
      group.entries.push(entry)
      group.minutes += entry.minutes
      group.km += entry.tripKm ?? 0
    }
    return groups
  }, [entries, byMonth])

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

  const hasActions = entries.some((entry) => isEditable(entry))
  // Imported in bulk (My Semisto…): said once above the list, not on every line.
  const allImported = entries.length > 0 && entries.every((entry) => entry.source === 'import')
  const cols = hasActions ? COLS_WITH_ACTIONS : COLS

  function isEditable(entry: TimeEntry) {
    return entry.userId === userId && entry.status === 'noted' && projects.some((p) => p.id === entry.mapId)
  }

  return (
    <>
      {allImported && (
        <p className="mb-2 inline-flex items-center gap-1.5 text-sm text-loam-500">
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />{t('time_entries.entry.all_imported')}
        </p>
      )}
      <div aria-hidden className={clsx('hidden gap-x-3 border-b border-loam-900/10 pb-1.5 text-sm text-loam-500 sm:grid', cols)}>
        <span>{t('time_entries.entry.columns.day')}</span>
        <span>{show === 'project' ? t('time_entries.entry.columns.project') : t('time_entries.entry.columns.person')}</span>
        <span>{t('time_entries.entry.columns.note')}</span>
        <span className="text-right">{t('time_entries.entry.columns.km')}</span>
        <span className="text-right">{t('time_entries.entry.columns.hours')}</span>
      </div>
      {months.map((group) => {
        const phases = new Set(group.entries.map((entry) => entry.phase))
        // One phase for the whole month: named once, in the month's line.
        const monthPhase = group.month && phases.size === 1 ? group.entries[0].phase : null
        return (
          <Fragment key={group.month || 'all'}>
            {group.month && (
              <div className={clsx('mt-5 flex items-baseline justify-between gap-3 border-b border-loam-900/10 pb-1 sm:grid sm:gap-y-0', cols)}>
                <h3 className="text-sm font-semibold text-loam-700 sm:col-span-3">
                  <span className="uppercase tracking-wide">{formatMonth(group.month)}</span>
                  {monthPhase && <span className="font-normal text-loam-500"> · {t(`time_entries.phases.${monthPhase}`)}</span>}
                </h3>
                <p className="shrink-0 whitespace-nowrap text-sm tabular-nums text-loam-500 sm:contents">
                  <span className="sm:text-right">{group.km > 0 ? formatKm(Math.round(group.km * 10) / 10) : ''}<span className="sm:hidden">{group.km > 0 ? ' km · ' : ''}</span></span>
                  <span className="font-semibold text-loam-700 sm:text-right">{formatDuration(group.minutes)}</span>
                </p>
              </div>
            )}
            <ul className="divide-y divide-loam-900/5">
              {group.entries.map((entry) => {
                const editable = isEditable(entry)
                const who = show === 'project'
                  ? <Link href={`/maps/${entry.mapId}/time_entries`} className="hover:text-prune-800 hover:underline">{entry.mapName}</Link>
                  : readableName(entry.userName)
                const source = !allImported && SOURCE_ICONS[entry.source]
                return (
                  <li
                    key={entry.id}
                    className={clsx(
                      'group grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 py-2',
                      '[grid-template-areas:"day_who_hours"_"note_note_km"_"acts_acts_acts"] sm:gap-x-3',
                      cols, hasActions ? AREAS_WITH_ACTIONS : AREAS,
                    )}
                  >
                    <span className="text-sm text-loam-500 first-letter:uppercase [grid-area:day]">{formatDay(entry.workedOn)}</span>
                    <span className="truncate text-sm text-loam-900 [grid-area:who]" title={show === 'person' ? entry.userName : entry.mapName}>{who}</span>
                    <div className="min-w-0 text-sm text-loam-600 [grid-area:note]">
                      {!monthPhase && <span className="text-loam-500">{t(`time_entries.phases.${entry.phase}`)}{entry.note ? ' · ' : ''}</span>}
                      {entry.note}
                      {!entry.billable && <Pill tone="humus" className="ml-1.5 align-baseline">{t(`time_entries.reasons.${entry.nonBillableReason ?? 'other'}`)}</Pill>}
                      {entry.billTo && show === 'project' && <span className="text-loam-500"> · {entry.billTo}</span>}
                      {source && (
                        <Tooltip content={t(`time_entries.entry.${source.label}`)} className="ml-1.5 align-middle">
                          <span tabIndex={0} aria-label={t(`time_entries.entry.${source.label}`)} className="text-loam-400"><source.Icon className="h-3.5 w-3.5" aria-hidden /></span>
                        </Tooltip>
                      )}
                    </div>
                    <span className="text-right text-sm tabular-nums text-loam-500 [grid-area:km]">
                      {entry.tripKm != null && <>{formatKm(entry.tripKm)}<span className="sm:hidden"> km</span></>}
                    </span>
                    <span className={clsx('inline-flex items-baseline justify-end gap-1 text-right tabular-nums [grid-area:hours]', entry.billable ? 'font-semibold text-loam-900' : 'text-loam-500')}>
                      {entry.status === 'invoiced' && (
                        <Tooltip content={`${t('time_entries.statuses.invoiced')}${entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ''}`}>
                          <span tabIndex={0} aria-label={t('time_entries.statuses.invoiced')} className="text-leaf-600"><Lock className="h-3.5 w-3.5" aria-hidden /></span>
                        </Tooltip>
                      )}
                      {formatDuration(entry.minutes)}
                    </span>
                    {editable && (
                      <div className="flex justify-end gap-0.5 self-center transition-opacity [grid-area:acts] sm:opacity-40 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <IconButton size="sm" label={t('time_entries.entry.edit')} onClick={() => setEditing(entry)}><Pencil /></IconButton>
                        <IconButton size="sm" tone="danger" label={t('time_entries.entry.delete')} onClick={() => void remove(entry)}><Trash2 /></IconButton>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Fragment>
        )
      })}
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
