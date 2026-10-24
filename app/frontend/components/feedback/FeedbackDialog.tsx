import { usePage } from '@inertiajs/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { mapIdFromPath } from '@/components/feedback/openFeedback'
import type { SharedProps } from '@/types'

const MESSAGE_LIMIT = 4000

/**
 * « Un retour ? »: a few words to Semisto, from any page. The page (and its
 * map) goes with them, so nobody has to ask « tu étais où ? ». Saved by the
 * server (FeedbacksController); while a replay is recording, a copy goes to
 * Sentry next to it.
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { url, props } = usePage()
  const { sessionReplay } = props as unknown as SharedProps
  const [message, setMessage] = useState('')
  const [wantsCall, setWantsCall] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const path = url.split('?')[0]

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    const mapId = mapIdFromPath(path)
    const replay = sessionReplay === 'record' || sessionReplay === 'keep' ? await import('@/lib/replay') : null
    const replayId = replay?.currentReplayId()
    try {
      await api('/feedback', {
        method: 'POST',
        body: { feedback: { message: text, path, map_id: mapId, wants_call: wantsCall, sentry_replay_id: replayId ?? null } },
      })
      if (replayId) replay?.sendFeedbackToSentry(text, mapId)
      setMessage('')
      setWantsCall(false)
      onClose()
      toast(t('feedback.sent'), { tone: 'success' })
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 429 ? t('feedback.rate_limited') : t('feedback.error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('feedback.title')}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('feedback.cancel')}</Button>
          <Button type="submit" form="feedback-form" disabled={!message.trim() || sending}>
            {sending ? t('feedback.sending') : t('feedback.send')}
          </Button>
        </>
      }
    >
      <form id="feedback-form" onSubmit={submit} className="space-y-4">
        <p className="text-loam-600">{t('feedback.intro')}</p>
        <Field label={t('feedback.label')} error={error ?? undefined}>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={MESSAGE_LIMIT}
            placeholder={t('feedback.placeholder')}
            autoFocus
          />
        </Field>
        <HandNote arrow="left" tone="loam" className="ml-2">{t('feedback.note')}</HandNote>
        <label className="flex items-start gap-2.5 text-sm text-loam-700">
          <input type="checkbox" className="mt-0.5 rounded border-loam-300 text-prune-600" checked={wantsCall} onChange={(e) => setWantsCall(e.target.checked)} />
          <span>{t('feedback.wants_call')}</span>
        </label>
        <p className="text-sm text-loam-500">{t('feedback.context')}</p>
      </form>
    </Dialog>
  )
}
