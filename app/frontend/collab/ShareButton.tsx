import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { RevealLabel } from '@/components/ui/RevealLabel'
import { t } from '@/lib/i18n'
import { ShareDialog } from './ShareDialog'

/** Header action "Partager": opens the sharing dialog. */
export default function ShareButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" className="group gap-x-0 pl-2 pr-2" aria-label={t('collab.share.button')} onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4" />
        <RevealLabel>{t('collab.share.button')}</RevealLabel>
      </Button>
      {open && <ShareDialog onClose={() => setOpen(false)} />}
    </>
  )
}
