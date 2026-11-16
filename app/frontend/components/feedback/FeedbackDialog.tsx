import { usePage } from '@inertiajs/react'
import { Camera, PencilLine, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { mapIdFromPath } from '@/components/feedback/openFeedback'
import { browserContext, capturePage, flatten, type Capture, type Rect, type Stroke } from '@/components/feedback/capture'
import { ScreenshotAnnotator } from '@/components/feedback/ScreenshotAnnotator'
import type { SharedProps } from '@/types'

const MESSAGE_LIMIT = 4000

/**
 * « Un retour ? »: a few words to Semisto, from any page. The page (and its
 * map) goes with them, so nobody has to ask « tu étais où ? », and, if the
 * person wants, a screenshot they crop and circle with a pencil
 * (ScreenshotAnnotator) to show what they mean. Saved by the server
 * (FeedbacksController); while a replay is recording, a copy goes to Sentry
 * next to it.
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { url, props } = usePage()
  const { sessionReplay } = props as unknown as SharedProps
  const [message, setMessage] = useState('')
  const [wantsCall, setWantsCall] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const path = url.split('?')[0]
  const form = useRef<HTMLFormElement>(null)
  // The screenshot: the raw capture, how it is cropped and drawn on, and the image that will be sent.
  const [capture, setCapture] = useState<Capture | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [annotating, setAnnotating] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captureFailed, setCaptureFailed] = useState(false)
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function takeScreenshot() {
    setCapturing(true)
    setCaptureFailed(false)
    try {
      const taken = await capturePage(form.current?.closest('dialog') ?? null)
      if (capture) URL.revokeObjectURL(capture.url)
      setCapture(taken)
      setCrop(taken.visible)
      setStrokes([])
      setAnnotating(true)
    } catch {
      setCaptureFailed(true)
    } finally {
      setCapturing(false)
    }
  }

  async function keepScreenshot(nextCrop: Rect, nextStrokes: Stroke[]) {
    if (!capture) return
    setCrop(nextCrop)
    setStrokes(nextStrokes)
    setAnnotating(false)
    try {
      const blob = await flatten(capture, nextCrop, nextStrokes)
      if (image) URL.revokeObjectURL(image.url)
      setImage({ blob, url: URL.createObjectURL(blob) })
    } catch {
      setCaptureFailed(true)
    }
  }

  function dropScreenshot() {
    if (capture) URL.revokeObjectURL(capture.url)
    if (image) URL.revokeObjectURL(image.url)
    setCapture(null)
    setCrop(null)
    setStrokes([])
    setImage(null)
    setAnnotating(false)
  }

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
      const body = new FormData()
      body.append('feedback[message]', text)
      body.append('feedback[path]', path)
      if (mapId) body.append('feedback[map_id]', String(mapId))
      body.append('feedback[wants_call]', String(wantsCall))
      if (replayId) body.append('feedback[sentry_replay_id]', replayId)
      for (const [key, value] of Object.entries(browserContext())) if (value) body.append(`feedback[context][${key}]`, value)
      if (image) body.append('feedback[screenshot]', image.blob, 'capture.jpg')
      await api('/feedback', { method: 'POST', body })
      if (replayId) replay?.sendFeedbackToSentry(text, mapId)
      setMessage('')
      setWantsCall(false)
      dropScreenshot()
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
      <form ref={form} id="feedback-form" onSubmit={submit} className="space-y-4">
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
        <div className="space-y-2">
          {image ? (
            <figure className="flex items-start gap-3">
              <img src={image.url} alt={t('feedback.capture.alt')} className="h-24 w-36 shrink-0 rounded-lg object-cover object-top ring-1 ring-loam-200" />
              <figcaption className="flex flex-col items-start gap-1">
                <Button size="sm" variant="ghost" onClick={() => setAnnotating(true)}>
                  <PencilLine className="h-4 w-4" aria-hidden />{t('feedback.capture.edit')}
                </Button>
                <Button size="sm" variant="danger-ghost" onClick={dropScreenshot}>
                  <Trash2 className="h-4 w-4" aria-hidden />{t('feedback.capture.remove')}
                </Button>
              </figcaption>
            </figure>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={takeScreenshot} disabled={capturing}>
                <Camera className="h-4 w-4" aria-hidden />
                {capturing ? t('feedback.capture.taking') : t('feedback.capture.attach')}
              </Button>
              <p className="text-sm text-loam-500">{captureFailed ? t('feedback.capture.failed') : t('feedback.capture.why')}</p>
            </>
          )}
        </div>
        <label className="flex items-start gap-2.5 text-sm text-loam-700">
          <input type="checkbox" className="mt-0.5 rounded border-loam-300 text-prune-600" checked={wantsCall} onChange={(e) => setWantsCall(e.target.checked)} />
          <span>{t('feedback.wants_call')}</span>
        </label>
        <p className="text-sm text-loam-500">{t('feedback.context')}</p>
      </form>
      {annotating && capture && crop && (
        <ScreenshotAnnotator capture={capture} crop={crop} strokes={strokes} onDone={keepScreenshot} onCancel={() => (image ? setAnnotating(false) : dropScreenshot())} />
      )}
    </Dialog>
  )
}
