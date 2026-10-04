import { KeyRound } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Avatar } from '@/collab/Avatar'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { ApiError, api } from '@/lib/api'
import { tf, typo } from '@/lib/content'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { useEditor } from '@/map/editor/EditorContext'
import type { SharingData } from '@/types/collab'
import type { TransferCandidate, TransferSectionData } from '@/types/transfer'

type Props = {
  /** The sharing dialog's data: the section reloads when members or roles change. */
  data: SharingData
  /** `/maps/:id` */
  base: string
}

/**
 * « Transférer la propriété » (owner only, in the sharing dialog): propose
 * the map to an editor, or to a member of its team, with what changes; then
 * the pending proposal, which the owner can cancel until it is answered.
 */
export function MapTransferSection({ data, base }: Props) {
  const editor = useEditor()
  const [state, setState] = useState<TransferSectionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const membersKey = data.members.map((m) => `${m.userId}:${m.role}`).join(',') + `|${data.organization?.id ?? ''}`

  useEffect(() => {
    let live = true
    api<TransferSectionData>(`${base}/transfers`)
      .then((loaded) => { if (live) setState(loaded) })
      .catch(() => { if (live) setError(tf('transfer.section.load_error')) })
    return () => { live = false }
  }, [base, membersKey])

  const run = useCallback(async (request: () => Promise<TransferSectionData>, success: string) => {
    setBusy(true)
    setError(null)
    try {
      setState(await request())
      editor.notify(success)
      setOpen(false)
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : t('collab.share.error'))
    } finally {
      setBusy(false)
    }
  }, [editor])

  return (
    <section aria-labelledby="share-transfer" className="space-y-3 border-t border-loam-100 pt-4">
      <h3 id="share-transfer" className="flex items-center gap-1.5 text-sm font-semibold text-loam-900">
        <KeyRound className="h-4 w-4 text-loam-500" aria-hidden="true" />
        {tf('transfer.section.title')}
      </h3>
      {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{typo(error)}</p>}
      {!state ? (
        !error && <p className="text-xs text-loam-500">{t('common.loading')}</p>
      ) : state.pending ? (
        <Pending state={state} busy={busy} onCancel={(id, name) => {
          if (window.confirm(tf('transfer.section.cancel_confirm', { name }))) {
            void run(() => api<TransferSectionData>(`${base}/transfers/${id}`, { method: 'DELETE' }), tf('transfer.section.canceled'))
          }
        }} />
      ) : state.archived ? (
        <p className="text-xs text-loam-500">{tf('transfer.section.archived')}</p>
      ) : (state.candidates ?? []).length === 0 ? (
        <NoCandidate state={state} />
      ) : open ? (
        <ProposeForm
          state={state}
          maxEditors={data.maxEditors}
          busy={busy}
          onCancel={() => setOpen(false)}
          onPropose={(candidate) => void run(
            () => api<TransferSectionData>(`${base}/transfers`, { method: 'POST', body: { transfer: { recipient_id: candidate.userId } } }),
            tf('transfer.section.proposed', { name: candidate.name }),
          )}
        />
      ) : (
        <>
          <p className="text-xs text-loam-500">{tf('transfer.section.intro')}</p>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{tf('transfer.section.open')}</Button>
        </>
      )}
    </section>
  )
}

function Pending({ state, busy, onCancel }: { state: TransferSectionData; busy: boolean; onCancel: (id: number, name: string) => void }) {
  const pending = state.pending!
  const { recipient } = pending
  return (
    <div className="rounded-lg bg-prune-50 p-3 ring-1 ring-prune-100">
      <div className="flex items-start gap-3">
        <Avatar name={recipient.name} url={recipient.avatarUrl} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-loam-900">{tf('transfer.section.pending', { name: recipient.name, date: formatDate(pending.createdAt) })}</p>
          <p className="mt-0.5 text-xs text-loam-600">{tf('transfer.section.pending_until', { date: formatDate(pending.expiresAt) })}</p>
        </div>
      </div>
      {pending.problem && <p role="alert" className="mt-2 text-xs text-humus-700">{typo(pending.problem)}</p>}
      <Button size="sm" variant="secondary" className="mt-3" disabled={busy} onClick={() => onCancel(pending.id, recipient.name)}>
        {tf('transfer.section.cancel')}
      </Button>
    </div>
  )
}

function NoCandidate({ state }: { state: TransferSectionData }) {
  return (
    <div className="space-y-1 text-xs text-loam-500">
      <p>{tf('transfer.section.no_editor')}</p>
      {(state.viewersCount ?? 0) > 0 && <p>{tf('transfer.section.viewers_hint')}</p>}
    </div>
  )
}

type FormProps = {
  state: TransferSectionData
  maxEditors: number
  busy: boolean
  onCancel: () => void
  onPropose: (candidate: TransferCandidate) => void
}

function ProposeForm({ state, maxEditors, busy, onCancel, onPropose }: FormProps) {
  const candidates = state.candidates ?? []
  const [userId, setUserId] = useState<number>(candidates[0].userId)
  const selected = candidates.find((c) => c.userId === userId) ?? candidates[0]
  const editors = candidates.filter((c) => !c.viaTeam)
  const team = candidates.filter((c) => c.viaTeam)
  const seatsLeft = state.seatsLeft ?? 0
  const blocked = selected.viaTeam && seatsLeft === 0

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!blocked) onPropose(selected)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {candidates.length > 1 ? (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-loam-600">{tf('transfer.section.choose')}</span>
          <Select value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
            {editors.length > 0 && (
              <optgroup label={tf('transfer.section.editors_group')}>
                {editors.map((c) => <option key={c.userId} value={c.userId}>{c.email ? `${c.name} (${c.email})` : c.name}</option>)}
              </optgroup>
            )}
            {team.length > 0 && (
              <optgroup label={tf('transfer.section.team_group', { team: state.team ?? '' })}>
                {team.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
              </optgroup>
            )}
          </Select>
        </label>
      ) : (
        <div className="flex items-center gap-3">
          <Avatar name={selected.name} url={selected.avatarUrl} className="h-8 w-8" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-loam-900">{selected.name}</p>
            {selected.email && <p className="truncate text-xs text-loam-500">{selected.email}</p>}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-loam-50 p-3 text-xs text-loam-700">
        <p className="font-medium text-loam-900">{tf('transfer.section.changes_title', { name: selected.name })}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>{tf('transfer.section.changes.plan', { name: selected.name })}</li>
          <li>{tf('transfer.section.changes.you_stay')}</li>
          <li>{tf('transfer.section.changes.kept')}</li>
          <li>{tf('transfer.section.changes.consent', { name: selected.name, days: state.expiresInDays ?? 14 })}</li>
        </ul>
      </div>
      {selected.viaTeam && (
        <p className={'text-xs ' + (blocked ? 'text-humus-700' : 'text-loam-500')}>
          {blocked
            ? tf('transfer.section.team_no_seat', { name: selected.name, max: maxEditors })
            : tf('transfer.section.team_seat', { name: selected.name, count: seatsLeft })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || blocked}>{tf('transfer.section.propose', { name: selected.name })}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{tf('transfer.section.back')}</Button>
      </div>
    </form>
  )
}
