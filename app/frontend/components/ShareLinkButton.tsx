import { Check, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toast'
import { t } from '@/lib/i18n'

/** The absolute address of a path of the app (`/maps/3/photos?open=12`). */
export function absoluteUrl(path: string) {
  return new URL(path, window.location.origin).toString()
}

/**
 * « Copier le lien » beside a photo, a video or a document: the address that
 * reopens this very view, sidebar included, for whoever has a role on the
 * map (after signing in, which brings them back here). On a phone it opens
 * the system's share sheet (Messages, WhatsApp, e-mail), where a link is
 * sent rather than copied; anywhere else it goes to the clipboard.
 */
export function ShareLinkButton({ path, title, variant = 'secondary', className }: {
  path: string
  /** Shown by the share sheet as the link's title. */
  title?: string
  variant?: 'secondary' | 'ghost'
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function share() {
    const url = absoluteUrl(path)
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, title })
        return
      } catch (error) {
        // Closed by the person: nothing to do. Refused by the browser: copy instead.
        if ((error as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast(t('share_link.copied'), { tone: 'success' })
    } catch {
      toast(t('share_link.failed'), { tone: 'error' })
    }
  }

  return (
    <Button type="button" size="sm" variant={variant} onClick={() => void share()} title={t('share_link.hint')} className={className}>
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
      {copied ? t('share_link.copied') : t('share_link.copy')}
    </Button>
  )
}
