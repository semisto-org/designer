import { usePage } from '@inertiajs/react'
import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { t } from '@/lib/i18n'
import { openTour } from '@/map/tour/TourOverlay'
import type { InvitationWelcome } from '@/types/collab'
import { chatActions } from '../chat/chatStore'
import { WelcomeAbilities, WelcomeTime, invitedLine } from './WelcomeParts'

/** The help article for whoever receives a plan to read (app/help). */
export const READER_GUIDE = '/help/tu-as-recu-le-plan-de-ton-jardin'

/**
 * The first moment on a map one was invited to: who invited you, what you
 * can do here and since when this garden grows, instead of the carnet de
 * route told on an example terrain (it stays one click away).
 */
export default function WelcomeCard() {
  const { props } = usePage<{ welcome?: InvitationWelcome | null }>()
  const welcome = props.welcome
  const [open, setOpen] = useState(welcome != null)
  if (!welcome) return null
  const close = () => setOpen(false)
  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('collab.joining.welcome.card_title', { map: welcome.mapName })}
      footer={(
        <>
          {welcome.role === 'viewer' ? (
            // A reader is not here to design: the guide to reading the plan, beside the map.
            <Button variant="ghost" onClick={() => window.open(READER_GUIDE, '_blank', 'noopener')}>{t('collab.joining.welcome.reader_guide')}</Button>
          ) : (
            <Button variant="ghost" onClick={() => { close(); openTour() }}>{t('collab.joining.welcome.tour')}</Button>
          )}
          {welcome.chat ? (
            <>
              <Button variant="secondary" onClick={close}>{t('collab.joining.welcome.explore')}</Button>
              <Button onClick={() => { close(); chatActions.setOpen(true) }}>
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t('collab.joining.welcome.open_chat')}
              </Button>
            </>
          ) : (
            <Button onClick={close}>{t('collab.joining.welcome.explore')}</Button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-lg text-loam-700">{invitedLine(welcome)}</p>
        <WelcomeTime welcome={welcome} />
        <WelcomeAbilities welcome={welcome} />
      </div>
    </Dialog>
  )
}
