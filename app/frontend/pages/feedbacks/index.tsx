import { Head, Link } from '@inertiajs/react'
import { MessageCircleHeart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CompanionEmpty } from '@/components/ui/Companion'
import { HandNote } from '@/components/ui/HandNote'
import { FeedbackPath, FeedbackStatusPill, type FeedbackStatusKey } from '@/components/feedback/FeedbackStatus'
import { openFeedback } from '@/components/feedback/openFeedback'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'

type MyFeedback = {
  id: number
  message: string
  path: string | null
  createdAt: string
  status: FeedbackStatusKey
  reply: string | null
  repliedBy: string | null
  statusChangedAt: string | null
  map: { id: number; name: string } | null
  screenshotUrl: string | null
}

/**
 * « Mes retours »: what the person told Semisto with « Un retour ? », and
 * what became of it (status, Semisto's answer), newest first.
 */
export default function MyFeedbacks({ feedbacks }: { feedbacks: MyFeedback[] }) {
  const newButton = (
    <Button onClick={openFeedback}>
      <MessageCircleHeart className="h-4 w-4" aria-hidden />{t('feedback.mine.new')}
    </Button>
  )
  return (
    <div className="mx-auto max-w-3xl">
      <Head title={t('feedback.mine.title')} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl">{t('feedback.mine.title')}</h1>
          <p className="mt-1 max-w-2xl text-loam-600">{t('feedback.mine.intro')}</p>
        </div>
        {feedbacks.length > 0 && newButton}
      </div>

      {feedbacks.length === 0 ? (
        <CompanionEmpty className="mt-8" title={t('feedback.mine.empty_title')} why={t('feedback.mine.empty_body')} action={newButton} />
      ) : (
        <ul className="mt-8 space-y-4">
          {feedbacks.map((feedback) => (
            <li key={feedback.id}>
              <Card className="p-5!">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <FeedbackStatusPill status={feedback.status} />
                    <FeedbackPath status={feedback.status} />
                  </div>
                  <p className="text-sm text-loam-500">
                    {t('feedback.mine.sent_on', { when: relativeTime(feedback.createdAt) })}
                    {feedback.map ? <> · <Link href={`/maps/${feedback.map.id}`} className="hover:text-prune-700 hover:underline">{feedback.map.name}</Link></> : null}
                  </p>
                </div>
                <div className="mt-3 flex gap-4">
                  <p className="min-w-0 flex-1 whitespace-pre-line text-loam-800">{feedback.message}</p>
                  {feedback.screenshotUrl && (
                    <a href={feedback.screenshotUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img src={feedback.screenshotUrl} alt={t('feedback.mine.screenshot')} loading="lazy" className="h-20 w-28 rounded-lg object-cover object-top ring-1 ring-loam-200 hover:ring-prune-400" />
                    </a>
                  )}
                </div>
                <p className="mt-2 text-sm text-loam-500">{t(`feedback.status_hints.${feedback.status}`)}</p>
                {feedback.reply && (
                  <div className="mt-3 rounded-xl bg-leaf-50 px-4 py-3">
                    <HandNote tone="leaf">{t('feedback.mine.reply_from', { name: feedback.repliedBy ?? 'Semisto' })}</HandNote>
                    <p className="mt-1 whitespace-pre-line text-loam-800">{feedback.reply}</p>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
