import clsx from 'clsx'
import { Archive, Check, Moon, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar } from '@/collab/Avatar'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { BoardPhase, BoardProject, ClosedReason } from '@/types/teamBoard'
import { useBoard } from './board'

/**
 * A team project's settings: who leads it, who of the team works on it
 * (their faces show on the board), the date promised to the client, its
 * phase, on hold or awake, closed or reopened. Opened from the board and
 * from the map's « Partager » dialog.
 */
export function ProjectDialog({ project, onClose }: { project: BoardProject | null; onClose: () => void }) {
  const { members, phases, closedReasons, saveProject } = useBoard()
  const [lead, setLead] = useState('')
  const [crew, setCrew] = useState<number[]>([])
  const [promisedOn, setPromisedOn] = useState('')
  const [promisedWhat, setPromisedWhat] = useState('')
  const [phase, setPhase] = useState<BoardPhase>('design')
  const [onHold, setOnHold] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reason, setReason] = useState<ClosedReason>('declined')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const id = project?.id

  useEffect(() => {
    if (!project) return
    setLead(project.lead ? String(project.lead.id) : '')
    setCrew(project.crew.map((p) => p.id))
    setPromisedOn(project.promisedOn ?? '')
    setPromisedWhat(project.promisedWhat ?? '')
    setPhase(project.phase)
    setOnHold(!!project.onHoldSince)
    setClosing(false)
    setReason('declined')
    setNote('')
    setBusy(false)
    // Only when another project opens: a refreshed project keeps the answers being typed.
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>
  const leadId = lead ? Number(lead) : null
  const toggle = (person: number) => setCrew((list) => (list.includes(person) ? list.filter((p) => p !== person) : [...list, person]))

  async function run(change: Parameters<typeof saveProject>[1]) {
    if (!project) return
    setBusy(true)
    const ok = await saveProject(project, change)
    setBusy(false)
    if (ok) onClose()
  }

  const save = () => run({
    lead_id: leadId,
    crew_ids: [...new Set([...crew, ...(leadId ? [leadId] : [])])],
    promised_on: promisedOn || null,
    promised_what: promisedWhat || null,
    phase,
    ...(onHold !== !!project.onHoldSince ? { on_hold: onHold } : {}),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      dismissOnBackdrop={false}
      title={t('team_board.project.title', { name: project.name })}
      footer={project.closedAt ? (
        <Button onClick={() => void run({ reopen: true })} disabled={busy}><RotateCcw className="h-4 w-4" aria-hidden />{t('team_board.project.reopen')}</Button>
      ) : closing ? (
        <>
          <Button variant="ghost" onClick={() => setClosing(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => void run({ closed_reason: reason, closed_note: note || null })} disabled={busy}>{t('team_board.project.close')}</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" className="mr-auto text-loam-600" onClick={() => setClosing(true)}><Archive className="h-4 w-4" aria-hidden />{t('team_board.project.close')}</Button>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} disabled={busy}>{t('team_board.project.save')}</Button>
        </>
      )}
    >
      {project.closedAt ? (
        <p className="text-sm text-loam-600">
          {t('team_board.project.closed_since', { reason: project.closedReason ? t(`team_board.project.closed_reasons.${project.closedReason}`) : '' })}
          {project.closedNote && <span className="mt-2 block rounded-lg bg-loam-50 px-3 py-2 text-loam-700">« {project.closedNote} »</span>}
        </p>
      ) : closing ? (
        <div className="space-y-4">
          <p className="text-sm text-loam-600">{t('team_board.project.close_hint')}</p>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-sm font-medium text-loam-700">{t('team_board.project.close_reason')}</legend>
            {closedReasons.map((r) => (
              <label key={r} className={clsx('cursor-pointer rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', reason === r ? 'bg-clay-50 font-semibold text-clay-800 ring-clay-400' : 'text-loam-700 ring-loam-200 hover:ring-loam-400')}>
                <input type="radio" name="reason" className="sr-only" checked={reason === r} onChange={() => setReason(r)} />
                {t(`team_board.project.closed_reasons.${r}`)}
              </label>
            ))}
          </fieldset>
          <Field label={t('team_board.project.close_note')}>
            <Textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="space-y-6">
          <Field label={t('team_board.project.lead')} hint={t('team_board.project.lead_hint')}>
            <Select value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="">{t('team_board.project.no_lead')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>

          <fieldset>
            <legend className="text-sm font-medium text-loam-700">{t('team_board.project.crew')}</legend>
            <p className="text-sm text-loam-500">{t('team_board.project.crew_hint')}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {members.map((member) => {
                const isLead = member.id === leadId
                const on = isLead || crew.includes(member.id)
                return (
                  <label key={member.id} className={clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset transition',
                    on ? 'bg-leaf-50 ring-leaf-400' : 'ring-loam-200 hover:ring-loam-400',
                    isLead ? 'cursor-default' : 'cursor-pointer',
                  )}>
                    <input type="checkbox" className="sr-only" checked={on} disabled={isLead} onChange={() => toggle(member.id)} />
                    <Avatar name={member.name} url={member.avatarUrl} className={isLead ? 'h-9 w-9' : 'h-7 w-7'} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-loam-900">{member.name}</span>
                    {isLead ? <span className="text-sm text-leaf-800">{t('team_board.project.leads')}</span> : on && <Check className="h-4 w-4 text-leaf-700" aria-hidden />}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
            <Field label={t('team_board.project.promised')}>
              <Input type="date" value={promisedOn} onChange={(e) => setPromisedOn(e.target.value)} />
            </Field>
            <Field label={t('team_board.project.promised_what')}>
              <Input value={promisedWhat} maxLength={80} onChange={(e) => setPromisedWhat(e.target.value)} placeholder={t('team_board.project.promised_what_placeholder')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('team_board.project.phase')}>
              <Select value={phase} onChange={(e) => setPhase(e.target.value as BoardPhase)}>
                {phases.map((p) => <option key={p} value={p}>{t(`team_board.phases.${p}`)}</option>)}
              </Select>
            </Field>
            <label className={clsx('flex cursor-pointer items-start gap-3 self-end rounded-xl px-3 py-2 ring-1 ring-inset', onHold ? 'bg-loam-100 ring-loam-400' : 'ring-loam-200')}>
              <input type="checkbox" checked={onHold} onChange={(e) => setOnHold(e.target.checked)} className="mt-1 h-4 w-4 accent-prune-600" />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium text-loam-800"><Moon className="h-4 w-4" aria-hidden />{t('team_board.project.on_hold')}</span>
                <span className="block text-loam-500">{t('team_board.project.on_hold_hint')}</span>
              </span>
            </label>
          </div>
        </div>
      )}
    </Dialog>
  )
}
