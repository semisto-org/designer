import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { AlertTriangle, CalendarCheck, Check, CheckCircle2, Circle, FileText, ListChecks, Map as MapIcon, Moon, Settings2, Shovel, Sprout, Pencil } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Avatar } from '@/collab/Avatar'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { HandNote } from '@/components/ui/HandNote'
import { Pill } from '@/components/ui/Pill'
import { Skeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { BoardPhase, BoardProject, PreviewTask, ProjectPreviewData, StepKind } from '@/types/teamBoard'
import { boardBase, formatDay, useBoard } from './board'
import { PhaseIcon, phaseTone } from './PhaseIcon'

/** Beyond this, a project that has not left its column reads as stuck (as on its card). */
const STUCK_DAYS = 30
const STEP_ICONS: Record<StepKind, typeof Pencil> = { design: Pencil, site: Shovel, plant: Sprout }

/**
 * « Aperçu du projet »: what the team reads in its operational meeting
 * before (or instead of) opening the map. Where the project stands, the
 * next action and who carries it, what comes next and what was done, who
 * is on it, what was promised, its season and how far the offer went;
 * then the map or the offer, the two places the meeting goes on to.
 */
export function ProjectPreview({ project, onClose, onSettings, onNextStep }: {
  project: BoardProject | null
  onClose: () => void
  onSettings: (project: BoardProject) => void
  onNextStep: (project: BoardProject) => void
}) {
  const { teamId, phases } = useBoard()
  const [data, setData] = useState<ProjectPreviewData | null>(null)
  const [failed, setFailed] = useState(false)
  const id = project?.id
  // A change saved from the board (settings, next step) reloads the preview.
  const version = project && `${project.phase}|${project.lead?.id}|${project.crew.map((p) => p.id).join(',')}|${project.nextStep?.id}|${project.nextStep?.title}|${project.promisedOn}|${project.onHoldSince}`

  useEffect(() => {
    if (!id) return
    let live = true
    setFailed(false)
    api<{ preview: ProjectPreviewData }>(`${boardBase(teamId)}/projects/${id}/preview`)
      .then(({ preview }) => { if (live) setData(preview) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [id, version, teamId])

  useEffect(() => { if (!id) setData(null) }, [id])

  if (!project) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>
  const ready = data && data.id === project.id ? data : null
  const offer = ready?.offer
  // Before a yes, the meeting usually works on the offer; after it, on the map.
  const offerFirst = !!offer && (project.phase === 'request' || project.phase === 'offer') && offer.status !== 'accepted'

  return (
    <Dialog
      open
      onClose={onClose}
      title={<span className="block">
        <span className="block font-serif text-2xl leading-tight text-loam-900">{project.name}</span>
        {ready && <Subtitle data={ready} />}
      </span>}
      footer={<>
        <Button variant="ghost" className="mr-auto" onClick={() => onSettings(project)}><Settings2 className="h-4 w-4" aria-hidden />{t('team_board.preview.settings')}</Button>
        {offer && (
          <ButtonLink href={offer.url} variant={offerFirst ? 'primary' : 'secondary'}>
            <FileText className="h-4 w-4" aria-hidden />{t(offer.exists ? 'team_board.preview.open_offer' : 'team_board.preview.start_offer')}
          </ButtonLink>
        )}
        <ButtonLink href={`/maps/${project.id}`} variant={offerFirst ? 'secondary' : 'primary'}>
          <MapIcon className="h-4 w-4" aria-hidden />{t('team_board.preview.open_map')}
        </ButtonLink>
      </>}
    >
      {failed && !ready ? (
        <p className="text-sm text-clay-700">{t('team_board.preview.error')}</p>
      ) : !ready ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('team_board.preview.loading')}>
          <Skeleton shape="block" className="h-16 w-full" />
          <Skeleton shape="block" className="h-24 w-full" />
          <Skeleton shape="block" className="h-20 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <Timeline data={ready} phases={phases} />
          <NextAction data={ready} onNextStep={() => onNextStep(project)} />
          <div className="grid gap-6 sm:grid-cols-2">
            <People data={ready} />
            <div className="space-y-6">
              <Promise data={ready} />
              {offer && <OfferState offer={offer} />}
            </div>
          </div>
          <Done data={ready} mapId={project.id} />
          <Season data={ready} />
        </div>
      )}
    </Dialog>
  )
}

function Subtitle({ data }: { data: ProjectPreviewData }) {
  const parts = [
    data.address,
    data.areaM2 ? `${new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 0 }).format(data.areaM2)} m²` : null,
    data.request ? t('team_board.preview.request', { date: formatDay(data.request.createdAt) }) : null,
  ].filter(Boolean)
  return (
    <span className="mt-1 block space-y-0.5 font-sans text-sm font-normal text-loam-500">
      {parts.length > 0 && <span className="block">{parts.join(' · ')}</span>}
      {data.mainGoal && <span className="block text-loam-700">{t('team_board.preview.goal', { goal: data.mainGoal.toLowerCase() })}</span>}
    </span>
  )
}

function Heading({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-loam-700 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-loam-400">{icon}{children}</h3>
}

/** The six phases, the ones behind ticked, today's one grown, the ones to come in pencil. */
function Timeline({ data, phases }: { data: ProjectPreviewData; phases: BoardPhase[] }) {
  const at = phases.indexOf(data.phase)
  const settled = data.phase === 'co_management' || data.phase === 'completed'
  const stuck = !settled && !data.onHoldSince && !data.closedAt && data.daysInPhase > STUCK_DAYS
  return (
    <section aria-labelledby="preview-timeline">
      <Heading><span id="preview-timeline">{t('team_board.preview.timeline')}</span></Heading>
      <ol className="flex items-start">
        {phases.map((phase, i) => {
          const past = i < at
          const now = i === at
          return (
            <li key={phase} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
              {i > 0 && <span aria-hidden className={clsx('absolute top-4 right-1/2 -z-0 h-0.5 w-full', i <= at ? 'bg-leaf-300' : 'border-t-2 border-dashed border-loam-200 bg-transparent')} />}
              <span className={clsx(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-loam-50 ring-2',
                now ? 'ring-prune-400' : past ? 'ring-leaf-300' : 'ring-loam-200',
              )}>
                {past ? <Check className="h-4 w-4 text-leaf-600" aria-hidden /> : <PhaseIcon phase={phase} className={clsx('h-6 w-6', now ? phaseTone(phase) : 'text-loam-300')} />}
              </span>
              <span className={clsx('mt-1 w-full truncate px-0.5 text-sm', now ? 'font-semibold text-loam-900' : clsx('hidden sm:block', past ? 'text-loam-600' : 'text-loam-400'))}>
                {t(`team_board.phases.${phase}`)}
              </span>
              {now && <span className="sr-only">{t('team_board.preview.since', { count: data.daysInPhase })}</span>}
            </li>
          )
        })}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-loam-600">
        <span><strong className="font-semibold text-loam-800">{t(`team_board.phases.${data.phase}`)}</strong> {t('team_board.preview.since', { count: data.daysInPhase })}</span>
        {data.onHoldSince && <Pill icon={<Moon />}>{t('team_board.frieze.on_hold')}</Pill>}
        {data.closedAt && <Pill tone="clay">{t('team_board.frieze.closed_one')}</Pill>}
        {data.readOnly && <Pill tone="humus">{t('team_board.preview.read_only')}</Pill>}
      </div>
      {stuck && <HandNote tone="prune" className="mt-1">{t('team_board.preview.stuck')}</HandNote>}
    </section>
  )
}

function Who({ person, size = 'sm' }: { person: PreviewTask['assignee']; size?: 'sm' | 'md' }) {
  if (!person) return <span className="text-loam-500">{t('team_board.preview.nobody')}</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={person.name} url={person.avatarUrl} className={size === 'md' ? 'h-7 w-7' : 'h-5 w-5'} />
      <span className="truncate">{person.name}</span>
    </span>
  )
}

/** The next action, large, with who carries it and when; then the ones after it. */
function NextAction({ data, onNextStep }: { data: ProjectPreviewData; onNextStep: () => void }) {
  const next = data.nextStep
  return (
    <section aria-labelledby="preview-next" className="rounded-2xl border border-loam-200 bg-loam-50 p-4 shadow-[0_1px_0_var(--color-loam-200)]">
      <Heading><span id="preview-next">{t('team_board.preview.next')}</span></Heading>
      {next ? (
        <div className="space-y-2">
          <p className="font-serif text-xl leading-snug text-loam-900">{next.title}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-loam-700">
            <Who person={next.assignee} size="md" />
            {next.dueOn && (
              <span className={clsx('inline-flex items-center gap-1', next.overdue ? 'font-semibold text-clay-700' : 'text-loam-600')}>
                <CalendarCheck className="h-4 w-4" aria-hidden />
                {t(next.overdue ? 'team_board.preview.overdue_due' : 'team_board.preview.due', { date: formatDay(next.dueOn) })}
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-loam-600">{t('team_board.preview.no_next')}</p>
          <Button size="sm" variant="secondary" onClick={onNextStep}>{t('team_board.preview.set_next')}</Button>
        </div>
      )}
      {data.overdue > (next?.overdue ? 1 : 0) && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-clay-700">
          <AlertTriangle className="h-4 w-4" aria-hidden />{t('team_board.preview.overdue', { count: data.overdue })}
        </p>
      )}
      {data.coming.length > 0 && (
        <div className="mt-4 border-t border-loam-100 pt-3">
          <h4 className="mb-1.5 text-sm font-semibold text-loam-500">{t('team_board.preview.coming')}</h4>
          <ul className="space-y-1.5">
            {data.coming.map((task) => (
              <li key={task.id} className="flex gap-2 text-sm sm:items-center">
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-loam-300 sm:mt-0" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <span className="min-w-0 flex-1 text-loam-800">{task.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-loam-500">
                  {task.assignee && <Who person={task.assignee} />}
                  {task.dueOn && <span className={clsx('tabular-nums', task.overdue && 'font-semibold text-clay-700')}>{formatDay(task.dueOn)}</span>}
                </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {next && (
        <Button size="sm" variant="ghost" className="mt-3 -ml-3" onClick={onNextStep}>{t('team_board.preview.set_next')}</Button>
      )}
    </section>
  )
}

function People({ data }: { data: ProjectPreviewData }) {
  return (
    <section aria-labelledby="preview-people">
      <Heading><span id="preview-people">{t('team_board.preview.people')}</span></Heading>
      {data.lead ? (
        <p className="flex items-center gap-3">
          <Avatar name={data.lead.name} url={data.lead.avatarUrl} className="h-10 w-10 text-sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-loam-900">{data.lead.name}</span>
            <span className="block text-sm text-leaf-800">{t('team_board.preview.pm')}</span>
          </span>
        </p>
      ) : (
        <p className="text-sm font-semibold text-humus-800">{t('team_board.preview.no_pm')}</p>
      )}
      {data.crew.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
          {data.crew.map((person) => (
            <li key={person.id} className="flex items-center gap-1.5 text-sm text-loam-800">
              <Avatar name={person.name} url={person.avatarUrl} className="h-6 w-6" />{person.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-loam-500">{t('team_board.preview.crew_none')}</p>
      )}
    </section>
  )
}

function Promise({ data }: { data: ProjectPreviewData }) {
  return (
    <section aria-labelledby="preview-promise">
      <Heading icon={<CalendarCheck />}><span id="preview-promise">{t('team_board.preview.promised')}</span></Heading>
      <p className="text-sm text-loam-700">
        {data.promisedOn
          ? (data.promisedWhat
            ? t('team_board.frieze.promised_what', { what: data.promisedWhat, date: formatDay(data.promisedOn) })
            : t('team_board.frieze.promised', { date: formatDay(data.promisedOn) }))
          : <span className="text-loam-500">{t('team_board.preview.promised_none')}</span>}
      </p>
    </section>
  )
}

function OfferState({ offer }: { offer: NonNullable<ProjectPreviewData['offer']> }) {
  const tone = offer.status === 'accepted' ? 'leaf' : offer.status === 'declined' ? 'clay' : offer.status === 'sent' ? 'prune' : 'humus'
  return (
    <section aria-labelledby="preview-offer">
      <Heading icon={<FileText />}><span id="preview-offer">{t('team_board.preview.offer')}</span></Heading>
      {offer.status && offer.version && offer.statusOn ? (
        <Pill tone={tone}>{t(`team_board.preview.offer_status.${offer.status}`, { version: offer.version, date: formatDay(offer.statusOn) })}</Pill>
      ) : (
        <p className="text-sm text-loam-500">{t(offer.exists ? 'team_board.preview.offer_draft' : 'team_board.preview.offer_none')}</p>
      )}
    </section>
  )
}

/** The latest ticked tasks, and how far each task list went. */
function Done({ data, mapId }: { data: ProjectPreviewData; mapId: number }) {
  return (
    <section aria-labelledby="preview-done" className="grid gap-6 sm:grid-cols-2">
      <div>
        <Heading icon={<CheckCircle2 />}><span id="preview-done">{t('team_board.preview.done')}</span></Heading>
        {data.done.length === 0 ? (
          <p className="text-sm text-loam-500">{t('team_board.preview.no_done')}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.done.map((task) => (
              <li key={task.id} className="flex gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
                <span className="min-w-0">
                  <span className="text-loam-800">{task.title}</span>
                  {task.completedAt && (
                    <span className="block text-loam-500">
                      {task.completedBy
                        ? t('team_board.preview.done_by', { name: task.completedBy, date: formatDay(task.completedAt) })
                        : t('team_board.preview.done_on', { date: formatDay(task.completedAt) })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <Heading icon={<ListChecks />}>{t('team_board.preview.lists')}</Heading>
        <ul className="space-y-2.5">
          {data.lists.map((list) => (
            <li key={list.id} className="text-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-loam-800">{list.name}</span>
                <span className="shrink-0 text-loam-500 tabular-nums">{t('team_board.preview.list_progress', { done: list.done, total: list.total })}</span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-loam-100" aria-hidden>
                <span className={clsx('block h-full rounded-full', list.done === list.total ? 'bg-leaf-500' : 'bg-leaf-300')} style={{ width: `${(100 * list.done) / Math.max(1, list.total)}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/maps/${mapId}/tasks`} className="mt-3 inline-block text-sm font-semibold text-prune-700 hover:underline">{t('team_board.preview.all_tasks')}</Link>
      </div>
    </section>
  )
}

/** The project's design, work site and planting steps of the months to come. */
function Season({ data }: { data: ProjectPreviewData }) {
  return (
    <section aria-labelledby="preview-season">
      <Heading><span id="preview-season">{t('team_board.preview.season')}</span></Heading>
      {data.steps.length === 0 ? (
        <p className="text-sm text-loam-500">{t('team_board.preview.season_none')}</p>
      ) : (
        <ul className="space-y-1.5">
          {data.steps.map((step) => {
            const Icon = STEP_ICONS[step.kind]
            return (
              <li key={step.id} className={clsx('flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-3 py-1.5 text-sm', step.forecast ? 'border border-dashed border-loam-300' : 'bg-leaf-50')}>
                <Icon className="h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
                <span className="font-semibold text-loam-800">{step.title || t(`team_board.steps.${step.kind}`)}</span>
                <span className="text-loam-600">{t('team_board.preview.step_dates', { from: formatDay(step.startsOn), to: formatDay(step.dueOn) })}</span>
                {step.forecast && <span className="ml-auto text-loam-500">{t('team_board.season.forecast_legend')}</span>}
                {step.done && <Check className="ml-auto h-4 w-4 text-leaf-600" aria-hidden />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
