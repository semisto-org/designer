import { MessageCircleHeart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { openFeedback } from '@/components/feedback/openFeedback'
import { t } from '@/lib/i18n'

/** « Un retour ? » in a header (the app's, the editor's): opens FeedbackDialog. */
export function FeedbackButton() {
  return (
    <Button variant="ghost" size="sm" onClick={openFeedback} aria-haspopup="dialog" title={t('feedback.button')} className="shrink-0">
      <MessageCircleHeart className="h-4 w-4" aria-hidden />
      <span className="sr-only sm:not-sr-only">{t('feedback.button')}</span>
    </Button>
  )
}
