import { usePage } from '@inertiajs/react'
import { Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog'
import { OPEN_FEEDBACK } from '@/components/feedback/openFeedback'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { sentryEnabled } from '@/lib/sentry'
import type { ReplayState, SharedProps } from '@/types'

// Loaded once someone records, so that stopping still works after they change their mind.
let replayLoaded = false

/**
 * The beta's « Premières heures », mounted once (ImpersonationFrame): the
 * « Un retour ? » dialog, the question asked once to every signed-in person
 * (may Sentry record their first sessions?), and the recording itself,
 * which follows the server's state on every page (lib/replay.ts).
 */
export default function FirstHourHost() {
  const { currentUser, env, sessionReplay = 'off' } = usePage().props as unknown as SharedProps
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [answered, setAnswered] = useState<ReplayState | null>(null)
  const state = answered ?? sessionReplay
  const userId = currentUser?.id

  useEffect(() => {
    const onOpen = () => setFeedbackOpen(true)
    window.addEventListener(OPEN_FEEDBACK, onOpen)
    return () => window.removeEventListener(OPEN_FEEDBACK, onOpen)
  }, [])

  // The server's answer on the next page wins over the one kept here.
  useEffect(() => setAnswered(null), [sessionReplay])

  useEffect(() => {
    if (!sentryEnabled || !userId) return
    if (state !== 'record' && state !== 'keep' && !replayLoaded) return
    replayLoaded = true
    void import('@/lib/replay').then((replay) => replay.followReplay(state, userId))
  }, [state, userId])

  async function answer(consent: boolean) {
    try {
      const result = await api<{ state: ReplayState }>('/account/replay_consent', { method: 'PATCH', body: { consent } })
      setAnswered(result.state)
      toast(t(consent ? 'first_hour.consent.thanks_yes' : 'first_hour.consent.thanks_no'), { tone: 'success' })
    } catch {
      toast(t('first_hour.consent.error'), { tone: 'error' })
    }
  }

  return (
    <>
      {currentUser && <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />}
      {currentUser && state === 'ask' && <ConsentCard sessions={env.replaySessions} onAnswer={answer} />}
    </>
  )
}

function ConsentCard({ sessions, onAnswer }: { sessions: number; onAnswer: (consent: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const reply = async (consent: boolean) => {
    setBusy(true)
    await onAnswer(consent)
    setBusy(false)
  }
  return (
    <section
      aria-labelledby="first-hour-consent"
      className="fixed inset-x-3 bottom-3 z-[66] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-loam-900/10 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 print:hidden"
    >
      <h2 id="first-hour-consent" className="flex items-start gap-2 text-lg leading-snug">
        <Video className="mt-1 h-4 w-4 shrink-0 text-prune-600" aria-hidden />
        {t('first_hour.consent.title')}
      </h2>
      <p className="mt-2 text-sm text-loam-700">{t('first_hour.consent.body', { count: sessions })}</p>
      <p className="mt-2 text-sm text-loam-500">{t('first_hour.consent.detail')}</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void reply(false)}>{t('first_hour.consent.no')}</Button>
        <Button size="sm" disabled={busy} onClick={() => void reply(true)}>{t('first_hour.consent.yes')}</Button>
      </div>
    </section>
  )
}
