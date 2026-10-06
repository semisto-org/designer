import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { ShareDialog } from './ShareDialog'

/** Header action "Partager": opens the sharing dialog. */
export default function ShareButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4" />
        <span className="hidden sm:inline">{t('collab.share.button')}</span>
        <span className="sr-only sm:hidden">{t('collab.share.button')}</span>
      </Button>
      {open && <ShareDialog onClose={() => setOpen(false)} />}
    </>
  )
}
