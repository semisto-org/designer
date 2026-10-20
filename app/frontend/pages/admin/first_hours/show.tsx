import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { Check, MapPinned, MessageCircleHeart, PenLine, PhoneCall, Printer, Sprout, Video } from 'lucide-react'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Card, EmptyState } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'

const MILESTONES = ['map', 'outline', 'plant', 'print'] as const
type MilestoneKey = (typeof MILESTONES)[number]
const ICONS: Record<MilestoneKey, typeof MapPinned> = { map: MapPinned, outline: PenLine, plant: Sprout, print: Printer }

/** null: not yet. `at` null: done before the moment was dated. */
type Milestone = { at: string | null; minutes: number | null } | null
type Replay = { id: string; url: string | null; createdAt: string }
type Person = {
  id: number
  name: string
  email: string
  signedUpAt: string
  lastSignedInAt: string | null
  replayConsent: boolean | null
  map: { id: number; name: string } | null
  milestones: Record<MilestoneKey, Milestone>
  feedbacks: number
  replays: Replay[]
}
type Report = {
  since: string
  people: Person[]
  summary: { people: number; consented: number; replays: number; feedbacks: number; milestones: Record<MilestoneKey, { reached: number; firstHour: number }> }
}
type FeedbackRow = {
  id: number
  message: string
  path: string | null
  wantsCall: boolean
  createdAt: string
  map: { id: number; name: string } | null
  replayUrl: string | null
  author: { id: number; name: string; email: string }
}
type Props = {
  days: number
  periods: number[]
  report: Report
  feedbacks: FeedbackRow[]
  replay: { enabled: boolean; perUser: number; linked: boolean }
}

/** Staff: how the latest testers began, what they told us, and the sessions they let us record. */
export default function AdminFirstHours({ days, periods, report, feedbacks, replay }: Props) {
  const { summary } = report
  return (
    <div>
      <Head title={t('admin.first_hours.title')} />
      <AdminNav />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">{t('admin.first_hours.title')}</h1>
          <p className="mt-1 max-w-3xl text-loam-500">{t('admin.first_hours.intro')}</p>
        </div>
        <nav className="flex items-center gap-1.5 text-sm" aria-label={t('admin.first_hours.period.label')}>
          <span className="mr-1 text-loam-500">{t('admin.first_hours.period.label')}</span>
          {periods.map((period) => (
            <Link
              key={period}
              href={`/admin/first-hours?days=${period}`}
              aria-current={period === days ? 'page' : undefined}
              className={clsx(
                'rounded-full px-3 py-1 font-medium',
                period === days ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50',
              )}
            >
              {t('admin.first_hours.period.days', { count: period })}
            </Link>
          ))}
        </nav>
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-loam-700">
        <span className="font-semibold">{t('admin.first_hours.summary.people', { count: summary.people })}</span>
        <span>· {t('admin.first_hours.summary.consented', { count: summary.consented })}</span>
        <span>· {t('admin.first_hours.summary.replays', { count: summary.replays })}</span>
        <span>· {t('admin.first_hours.summary.feedbacks', { count: summary.feedbacks })}</span>
      </p>
      <p className="mt-1 text-sm text-loam-500">
        {replay.enabled ? t('admin.first_hours.replay_settings', { count: replay.perUser }) : t('admin.first_hours.replay_off')}
        {replay.enabled && !replay.linked && ` ${t('admin.first_hours.replay_unlinked_hint')}`}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MILESTONES.map((key) => {
          const Icon = ICONS[key]
          const { reached, firstHour } = summary.milestones[key]
          return (
            <Card key={key} className="p-4!">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-loam-700">{t(`admin.first_hours.milestones.${key}`)}</span>
                <span className="tabular-nums text-loam-600">{t('admin.first_hours.summary.reached', { count: reached, total: summary.people })}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-loam-100" aria-hidden>
                <div className="h-full rounded-full bg-leaf-500" style={{ width: `${summary.people ? Math.round((reached / summary.people) * 100) : 0}%` }} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-loam-500">
                <Icon className="h-4 w-4 text-leaf-600" aria-hidden />
                {t('admin.first_hours.summary.first_hour', { count: firstHour })}
              </p>
            </Card>
          )
        })}
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="first-hours-people">
          <h2 id="first-hours-people" className="text-lg">{t('admin.first_hours.people_title')}</h2>
          {report.people.length === 0 ? (
            <div className="mt-3"><EmptyState title={t('admin.first_hours.people_empty')} /></div>
          ) : (
            <ul className="mt-3 space-y-3">
              {report.people.map((person) => <PersonCard key={person.id} person={person} />)}
            </ul>
          )}
        </section>

        <section aria-labelledby="first-hours-feedbacks">
          <h2 id="first-hours-feedbacks" className="flex items-center gap-2 text-lg"><MessageCircleHeart className="h-5 w-5 text-prune-600" aria-hidden />{t('admin.first_hours.feedbacks_title')}</h2>
          <p className="mt-1 text-sm text-loam-500">{t('admin.first_hours.feedbacks_intro')}</p>
          {feedbacks.length === 0 ? (
            <div className="mt-3"><EmptyState title={t('admin.first_hours.feedbacks_empty')} /></div>
          ) : (
            <ul className="mt-3 space-y-3">
              {feedbacks.map((feedback) => <FeedbackCard key={feedback.id} feedback={feedback} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function PersonCard({ person }: { person: Person }) {
  return (
    <li>
      <Card className="p-4!">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <Link href={`/admin/users?q=${encodeURIComponent(person.email)}`} className="font-medium text-loam-900 hover:text-prune-700 hover:underline">{person.name}</Link>
            <p className="truncate text-sm text-loam-500">
              {person.email} · {t('admin.first_hours.signed_up', { time: relativeTime(person.signedUpAt) })}
              {person.lastSignedInAt && ` · ${t('admin.first_hours.last_seen', { time: relativeTime(person.lastSignedInAt) })}`}
            </p>
          </div>
          <ConsentPill consent={person.replayConsent} />
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MILESTONES.map((key) => <MilestoneStep key={key} name={key} milestone={person.milestones[key]} />)}
        </ol>
        {(person.map || person.replays.length > 0 || person.feedbacks > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            {person.map && <Link href={`/maps/${person.map.id}`} className="text-prune-700 hover:underline">{person.map.name}</Link>}
            {person.replays.map((replay, index) => <ReplayLink key={replay.id} replay={replay} number={index + 1} />)}
            {person.feedbacks > 0 && <Pill tone="prune" icon={<MessageCircleHeart aria-hidden />}>{t('admin.first_hours.feedbacks', { count: person.feedbacks })}</Pill>}
          </div>
        )}
      </Card>
    </li>
  )
}

function MilestoneStep({ name, milestone }: { name: MilestoneKey; milestone: Milestone }) {
  const Icon = ICONS[name]
  const done = milestone !== null
  return (
    <li className={clsx('rounded-xl px-3 py-2 ring-1 ring-inset', done ? 'bg-leaf-50 ring-leaf-200' : 'bg-loam-50 ring-loam-200')}>
      <p className={clsx('flex items-center gap-1.5 text-sm font-medium', done ? 'text-leaf-800' : 'text-loam-500')}>
        {done ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
        {t(`admin.first_hours.milestones.${name}`)}
      </p>
      <p className={clsx('text-sm tabular-nums', done ? 'text-leaf-700' : 'text-loam-400')}>
        {milestone === null ? t('admin.first_hours.not_yet') : milestone.minutes === null ? t('admin.first_hours.undated') : elapsed(milestone.minutes)}
      </p>
    </li>
  )
}

/** Time since the sign-up: minutes in the first hours, then hours, then days. */
function elapsed(minutes: number): string {
  if (minutes < 120) return t('admin.first_hours.minutes', { count: minutes })
  if (minutes < 48 * 60) return t('admin.first_hours.hours', { count: Math.round(minutes / 60) })
  return t('admin.first_hours.days', { count: Math.round(minutes / 1440) })
}

function ConsentPill({ consent }: { consent: boolean | null }) {
  if (consent === true) return <Pill tone="leaf" icon={<Video aria-hidden />}>{t('admin.first_hours.consent.yes')}</Pill>
  if (consent === false) return <Pill>{t('admin.first_hours.consent.no')}</Pill>
  return <Pill tone="humus">{t('admin.first_hours.consent.unasked')}</Pill>
}

function ReplayLink({ replay, number }: { replay: Replay; number: number }) {
  if (!replay.url) return <span className="text-loam-500">{t('admin.first_hours.replay_unlinked', { number, id: replay.id.slice(0, 8) })}</span>
  return (
    <a href={replay.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-prune-700 hover:underline">
      <Video className="h-4 w-4" aria-hidden />
      {t('admin.first_hours.replay', { number })}
    </a>
  )
}

function FeedbackCard({ feedback }: { feedback: FeedbackRow }) {
  const meta: ReactNode[] = [relativeTime(feedback.createdAt)]
  if (feedback.path) meta.push(<a key="page" href={feedback.path} className="hover:text-prune-700 hover:underline">{feedback.path}</a>)
  return (
    <li>
      <Card className="p-4!">
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-loam-500">
          <Link href={`/admin/users?q=${encodeURIComponent(feedback.author.email)}`} className="font-medium text-loam-900 hover:text-prune-700 hover:underline">{feedback.author.name}</Link>
          {meta.map((item, index) => <span key={index}>· {item}</span>)}
        </p>
        <p className="mt-2 whitespace-pre-line text-loam-800">{feedback.message}</p>
        {(feedback.map || feedback.wantsCall || feedback.replayUrl) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {feedback.wantsCall && <Pill tone="humus" icon={<PhoneCall aria-hidden />}>{t('admin.first_hours.wants_call')}</Pill>}
            {feedback.map && <Link href={`/maps/${feedback.map.id}`} className="text-prune-700 hover:underline">{feedback.map.name}</Link>}
            {feedback.replayUrl && (
              <a href={feedback.replayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-prune-700 hover:underline">
                <Video className="h-4 w-4" aria-hidden />{t('admin.first_hours.watch')}
              </a>
            )}
          </div>
        )}
      </Card>
    </li>
  )
}
