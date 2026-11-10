import { MessageCircleHeart } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { openFeedback } from '@/components/feedback/openFeedback'
import { STEPS_ASIDE_FOR_PAGE_BAR } from '@/components/MyBar'
import { t } from '@/lib/i18n'

/**
 * « Un retour ? » as a round button: floating at the bottom right of the
 * app's pages (`floating`), or in the map editor's header, where a floating
 * circle would cover the map's own controls. Opens FeedbackDialog.
 */
export function FeedbackButton({ floating = false }: { floating?: boolean }) {
  return (
    <IconButton
      label={t('feedback.button')}
      tone="prune"
      onClick={openFeedback}
      aria-haspopup="dialog"
      className={floating ? 'fixed bottom-4 right-4 z-40 h-12 w-12 bg-white shadow-lg ring-1 ring-loam-900/10 hover:bg-prune-50 sm:bottom-5 sm:right-6 print:hidden [&_svg]:h-6 [&_svg]:w-6 ' + STEPS_ASIDE_FOR_PAGE_BAR : undefined}
    >
      <MessageCircleHeart />
    </IconButton>
  )
}
