import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { PhoneCall, Video } from 'lucide-react'
import { useState } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { FEEDBACK_STATUSES, FeedbackStatusPill, type FeedbackStatusKey } from '@/components/feedback/FeedbackStatus'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'

type AdminFeedback = {
  id: number
  message: string
  path: string | null
  wantsCall: boolean
  createdAt: string
  map: { id: number; name: string } | null
  replayUrl: string | null
  screenshotUrl: string | null
  context: Record<string, string> | null
  appVersion: string | null
  status: FeedbackStatusKey
  reply: string | null
  authorNotifiedAt: string | null
  handledBy: string | null
  author: { id: number; name: string; email: string }
}

const FILTERS = ['awaiting', ...FEEDBACK_STATUSES, 'all'] as const
type Filter = (typeof FILTERS)[number]

/** Staff: « Retours ». Sort what people told us, answer, and tell them. */
export default function AdminFeedbacks({ feedbacks, counts, filter }: { feedbacks: AdminFeedback[]; counts: Record<Filter, number>; filter: Filter }) {
  return (
    <div>
      <Head title={t('admin.feedbacks.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.feedbacks.title')}</h1>
      <p className="mt-1 max-w-3xl text-loam-500">{t('admin.feedbacks.intro')}</p>

      <nav className="mt-6 flex flex-wrap gap-1.5" aria-label={t('admin.feedbacks.filter')}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/feedbacks?status=${f}`}
            preserveScroll
            aria-current={filter === f ? 'page' : undefined}
            className={clsx('rounded-full px-3 py-1.5 text-sm', filter === f ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50')}
          >
            {f === 'awaiting' || f === 'all' ? t(`admin.feedbacks.filters.${f}`) : t(`feedback.statuses.${f}`)}{' '}
            <span className={filter === f ? 'text-prune-200' : 'text-loam-500'}>{counts[f]}</span>
          </Link>
        ))}
      </nav>

      {feedbacks.length === 0 ? (
        <div className="mt-6"><EmptyState title={t('admin.feedbacks.empty')} /></div>
      ) : (
        <ul className="mt-6 space-y-4">
          {feedbacks.map((feedback) => <li key={feedback.id}><FeedbackCard feedback={feedback} /></li>)}
        </ul>
      )}
    </div>
  )
}

function FeedbackCard({ feedback }: { feedback: AdminFeedback }) {
  const [status, setStatus] = useState<FeedbackStatusKey>(feedback.status)
  const [reply, setReply] = useState(feedback.reply ?? '')
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const dirty = status !== feedback.status || reply.trim() !== (feedback.reply ?? '')

  function save() {
    setSaving(true)
    router.patch(`/admin/feedbacks/${feedback.id}`, { feedback: { status, reply, notify } }, { preserveScroll: true, onFinish: () => setSaving(false) })
  }

  const context = [feedback.context?.viewport, feedback.context?.language, feedback.appVersion && t('admin.first_hours.version', { version: feedback.appVersion.slice(0, 7) })].filter(Boolean).join(' · ')

  return (
    <Card className="p-0!">
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-loam-500">
            <FeedbackStatusPill status={feedback.status} />
            <Link href={`/admin/users?q=${encodeURIComponent(feedback.author.email)}`} className="font-medium text-loam-900 hover:text-prune-700 hover:underline">{feedback.author.name}</Link>
            <span>· {relativeTime(feedback.createdAt)}</span>
            {feedback.path && <span>· <a href={feedback.path} className="hover:text-prune-700 hover:underline">{feedback.path}</a></span>}
          </p>
          <p className="mt-2 whitespace-pre-line text-loam-800">{feedback.message}</p>
          {feedback.screenshotUrl && (
            <a href={feedback.screenshotUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block w-fit">
              <img src={feedback.screenshotUrl} alt={t('admin.first_hours.screenshot')} loading="lazy" className="max-h-72 max-w-full rounded-lg ring-1 ring-loam-200 hover:ring-prune-400" />
            </a>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {feedback.wantsCall && <Pill tone="humus" icon={<PhoneCall aria-hidden />}>{t('admin.first_hours.wants_call')}</Pill>}
            {feedback.map && <Link href={`/maps/${feedback.map.id}`} className="text-prune-700 hover:underline">{feedback.map.name}</Link>}
            {feedback.replayUrl && (
              <a href={feedback.replayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-prune-700 hover:underline">
                <Video className="h-4 w-4" aria-hidden />{t('admin.first_hours.watch')}
              </a>
            )}
            {context && <span className="text-loam-500">{context}</span>}
          </div>
        </div>
        <div className="space-y-3 lg:border-l lg:border-loam-100 lg:pl-5">
          <Field label={t('admin.feedbacks.status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatusKey)}>
              {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{t(`feedback.statuses.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('admin.feedbacks.reply')}>
            <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('admin.feedbacks.reply_placeholder')} maxLength={4000} />
          </Field>
          <label className="flex items-start gap-2 text-sm text-loam-700">
            <input type="checkbox" className="mt-0.5 rounded border-loam-300 text-prune-600" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>{t('admin.feedbacks.notify', { name: feedback.author.name })}</span>
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-loam-500">
              {feedback.authorNotifiedAt ? t('admin.feedbacks.notified', { when: relativeTime(feedback.authorNotifiedAt) }) : feedback.handledBy ? t('admin.feedbacks.handled_by', { name: feedback.handledBy }) : ''}
            </p>
            <Button onClick={save} disabled={!dirty || saving}>{t('admin.feedbacks.save')}</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
