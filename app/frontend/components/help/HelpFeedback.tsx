import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'

// The guides this browser already answered for: they say thanks instead of asking again.
const ANSWERED_KEY = 'designer.help.answered'
function readAnswered(): string[] {
  try { return JSON.parse(localStorage.getItem(ANSWERED_KEY) ?? '[]') } catch { return [] }
}
function remember(slug: string) {
  try { localStorage.setItem(ANSWERED_KEY, JSON.stringify([slug, ...readAnswered().filter((s) => s !== slug)].slice(0, 200))) } catch { /* no memory, no harm */ }
}

type Step = 'ask' | 'helpful' | 'missing' | 'thanks' | 'answered'

/**
 * « Ce guide t'a aidé ? » under a help article. The answer is sent at once;
 * « Pas vraiment » then asks what was missing (optional). Staff read both
 * in /admin/help.
 */
export function HelpFeedback({ slug, compact }: { slug: string; compact?: boolean }) {
  const [step, setStep] = useState<Step>('ask')
  const [token, setToken] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setStep(readAnswered().includes(slug) ? 'answered' : 'ask')
    setToken(null)
    setComment('')
    setError(null)
  }, [slug])

  const answer = (helpful: boolean) => {
    setError(null)
    setStep(helpful ? 'helpful' : 'missing')
    remember(slug)
    api<{ token: string }>(`/help/${slug}/feedback`, { method: 'POST', body: { helpful } })
      .then((data) => setToken(data.token))
      .catch((e: Error) => setError(e.message || t('help.feedback.error')))
  }

  const sendComment = () => {
    if (!token || !comment.trim()) { setStep('thanks'); return }
    setSending(true)
    api('/help/feedback', { method: 'PATCH', body: { token, comment } })
      .then(() => setStep('thanks'))
      .catch((e: Error) => setError(e.message || t('help.feedback.error')))
      .finally(() => setSending(false))
  }

  return (
    <section aria-labelledby={`help-feedback-${slug}`} className="rounded-2xl border border-dashed border-loam-300 bg-[#fffdf7] p-5">
      {step === 'ask' && (
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={`help-feedback-${slug}`} className="font-hand text-xl leading-none text-loam-800">{t('help.feedback.question')}</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => answer(true)}>
              <ThumbsUp className="h-4 w-4" aria-hidden />{t('help.feedback.yes')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => answer(false)}>
              <ThumbsDown className="h-4 w-4" aria-hidden />{t('help.feedback.no')}
            </Button>
          </div>
        </div>
      )}
      {step === 'helpful' && <p id={`help-feedback-${slug}`} role="status" className="text-sm text-loam-700">{t('help.feedback.thanks_helpful')}</p>}
      {step === 'answered' && <p id={`help-feedback-${slug}`} className="text-sm text-loam-500">{t('help.feedback.already')}</p>}
      {step === 'thanks' && <p id={`help-feedback-${slug}`} role="status" className="text-sm text-loam-700">{t('help.feedback.thanks_missing')}</p>}
      {step === 'missing' && (
        <form onSubmit={(event) => { event.preventDefault(); sendComment() }} className="space-y-3">
          <label htmlFor={`help-feedback-comment-${slug}`} id={`help-feedback-${slug}`} className="block font-hand text-xl leading-none text-loam-800">
            {t('help.feedback.missing_label')}
          </label>
          <Textarea
            id={`help-feedback-comment-${slug}`}
            rows={compact ? 3 : 4}
            maxLength={1000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t('help.feedback.missing_placeholder')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={sending}>{t('help.feedback.send')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setStep('thanks')}>{t('help.feedback.skip')}</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-clay-700">{error}</p>}
    </section>
  )
}
