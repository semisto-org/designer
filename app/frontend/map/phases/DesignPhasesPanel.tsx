import clsx from 'clsx'
import { Archive, Eye, Footprints, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { isPlanned } from '@/map/scenario'
import { deletePhase, putAwayPhase, renameCurrentPhase, updatePhase } from './api'
import { closePhase, loadPhases, openPhase, usePhases } from './store'
import { phaseDate, PHASE_NAMES, type DesignPhase } from './types'

const NO_PHASES: DesignPhase[] = []

/**
 * « Phases du projet »: a design goes through stages (esquisse,
 * avant-projet, projet détaillé…). The designer works on the phase in
 * progress, puts it away when it is decided, and starts the next one on
 * the same map; every phase put away stays, read-only, to reopen over
 * today's plan, compare, and take an element back from.
 */
export default function DesignPhasesPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const current = usePhases((s) => (s.mapId === mapId ? s.current : ''))
  const phases = usePhases((s) => (s.mapId === mapId ? s.phases : NO_PHASES))
  const loaded = usePhases((s) => s.mapId === mapId && s.loaded)
  const openId = usePhases((s) => (s.mapId === mapId ? s.open?.id ?? null : null))
  const [busy, setBusy] = useState(false)
  const [putting, setPutting] = useState(false)
  const [renaming, setRenaming] = useState<number | 'current' | null>(null)

  // Read again each time the panel opens; one message if it fails, not one per edit.
  const notify = useRef(editor.notify)
  notify.current = editor.notify
  useEffect(() => {
    loadPhases(mapId).catch(() => notify.current(t('design_phases.error'), 'error'))
  }, [mapId])

  // Phases are a matter of the project: the panel looks at the project.
  const setMode = editor.setMode
  useEffect(() => setMode('project'), [setMode])

  const planned = editor.features.filter((f) => f.properties.status === 'active' && isPlanned(f.properties)).length

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      return true
    } catch (error) {
      editor.notify((error as Error).message || t('design_phases.error'), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function rename(target: number | 'current', name: string, previous: string) {
    setRenaming(null)
    const next = name.trim()
    if (!next || next === previous) return
    await run(() => (target === 'current' ? renameCurrentPhase(editor, next) : updatePhase(editor, target, { name: next })))
  }

  async function remove(phase: DesignPhase) {
    const ok = await confirmAction({
      title: t('design_phases.delete_title', { name: phase.name }),
      body: t('design_phases.delete_body'),
      confirmLabel: t('design_phases.delete'),
      tone: 'danger',
    })
    if (ok && await run(() => deletePhase(editor, phase.id))) editor.notify(t('design_phases.deleted'))
  }

  async function reopen(phase: DesignPhase) {
    if (openId === phase.id) return closePhase()
    const ok = await run(() => openPhase(mapId, phase.id))
    // On a phone the panel covers the map: make room for the phase.
    if (ok && typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 768px)').matches) editor.openPanel(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('design_phases.intro')}</p>

      <section className="space-y-2 rounded-xl bg-prune-50/60 p-3 ring-1 ring-prune-200">
        <p className="text-sm font-medium text-prune-700">{t('design_phases.in_progress')}</p>
        {renaming === 'current' ? (
          <Input
            autoFocus
            aria-label={t('design_phases.rename')}
            defaultValue={current}
            maxLength={60}
            onBlur={(event) => void rename('current', event.target.value, current)}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(null) }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate font-serif text-xl text-loam-900">{current || '…'}</h3>
            {editor.canEdit && loaded && (
              <IconButton size="sm" label={t('design_phases.rename')} onClick={() => setRenaming('current')}><Pencil aria-hidden /></IconButton>
            )}
          </div>
        )}
        <p className="text-sm text-loam-600">{t('design_phases.planned_count', { count: planned })}</p>
        {editor.canEdit && (
          <Button size="sm" disabled={busy || !loaded} onClick={() => setPutting(true)}>
            <Archive className="h-4 w-4" aria-hidden />{t('design_phases.put_away')}
          </Button>
        )}
      </section>

      {loaded && phases.length === 0 && (
        <p className="font-hand text-xl leading-tight text-loam-600">{t('design_phases.empty')}</p>
      )}

      {phases.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-loam-700">{t('design_phases.put_away_title')}</h3>
          <ol className="space-y-2">
            {[...phases].reverse().map((phase) => {
              const isOpen = openId === phase.id
              return (
                <li key={phase.id} className={clsx('rounded-xl p-3 ring-1', isOpen ? 'bg-prune-50/60 ring-prune-200' : 'bg-white ring-loam-200')}>
                  {renaming === phase.id ? (
                    <Input
                      autoFocus
                      aria-label={t('design_phases.rename')}
                      defaultValue={phase.name}
                      maxLength={60}
                      onBlur={(event) => void rename(phase.id, event.target.value, phase.name)}
                      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(null) }}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-loam-100 text-sm tabular-nums text-loam-700">{phase.number}</span>
                      <p className="min-w-0 flex-1 truncate font-medium text-loam-900">{phase.name}</p>
                      {editor.canEdit && (
                        <>
                          <IconButton size="sm" label={t('design_phases.rename')} onClick={() => setRenaming(phase.id)}><Pencil aria-hidden /></IconButton>
                          <IconButton size="sm" label={t('design_phases.delete')} onClick={() => void remove(phase)}><Trash2 aria-hidden /></IconButton>
                        </>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-sm text-loam-600">
                    {t('design_phases.put_away_on', { date: phaseDate(phase.putAwayAt) })}
                    {phase.putAwayBy ? ` · ${phase.putAwayBy}` : ''}
                    {' · '}{t('design_phases.planned_count', { count: phase.counts.planned ?? 0 })}
                  </p>
                  {phase.notes && <p className="mt-1 font-hand text-lg leading-tight text-prune-700">{phase.notes}</p>}
                  <Button size="sm" variant={isOpen ? 'primary' : 'secondary'} className="mt-2" disabled={busy} onClick={() => void reopen(phase)}>
                    <Eye className="h-4 w-4" aria-hidden />{isOpen ? t('design_phases.hide') : t('design_phases.reopen')}
                  </Button>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <PutAwayDialog open={putting} current={current} busy={busy} onClose={() => setPutting(false)} onSubmit={async (values) => {
        if (await run(() => putAwayPhase(editor, values))) {
          setPutting(false)
          editor.notify(t('design_phases.put_away_done', { name: values.name || current }))
        }
      }} />
    </div>
  )
}

function PutAwayDialog({ open, current, busy, onClose, onSubmit }: {
  open: boolean
  current: string
  busy: boolean
  onClose: () => void
  onSubmit: (values: { name: string; notes: string; nextName: string }) => void
}) {
  const [name, setName] = useState(current)
  const [notes, setNotes] = useState('')
  const [nextName, setNextName] = useState('')
  useEffect(() => {
    if (!open) return
    setName(current)
    setNotes('')
    // The next stage of a usual design, after the one being put away.
    const names = PHASE_NAMES.map((key) => t(`design_phases.names.${key}`))
    const index = names.findIndex((n) => n.toLocaleLowerCase('fr') === current.toLocaleLowerCase('fr'))
    setNextName(index >= 0 && index < names.length - 1 ? names[index + 1] : '')
  }, [open, current])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('design_phases.dialog_title')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('design_phases.cancel')}</Button>
          <Button disabled={busy || !name.trim()} onClick={() => onSubmit({ name: name.trim(), notes: notes.trim(), nextName: nextName.trim() })}>
            <Archive className="h-4 w-4" aria-hidden />{t('design_phases.put_away')}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-loam-600">{t('design_phases.dialog_intro')}</p>
        <Field label={t('design_phases.name_label')}>
          <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t('design_phases.notes_label')} hint={t('design_phases.notes_hint')}>
          <Textarea rows={3} value={notes} maxLength={4000} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <Field label={t('design_phases.next_label')}>
          <Input value={nextName} maxLength={60} placeholder={t('design_phases.next_placeholder')} onChange={(event) => setNextName(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {PHASE_NAMES.map((key) => {
            const label = t(`design_phases.names.${key}`)
            return (
              <Button key={key} size="sm" variant={nextName === label ? 'primary' : 'secondary'} onClick={() => setNextName(label)}>{label}</Button>
            )
          })}
        </div>
        <p className="flex gap-2 text-sm text-loam-600">
          <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
          {t('design_phases.go_outside')}
        </p>
      </div>
    </Dialog>
  )
}
