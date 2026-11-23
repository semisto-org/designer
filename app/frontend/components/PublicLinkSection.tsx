import { Globe } from 'lucide-react'
import { CopyField } from '@/components/CopyField'
import { absoluteUrl } from '@/components/ShareLinkButton'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { toast } from '@/components/ui/toast'
import { t } from '@/lib/i18n'

/**
 * « Lien public » in the sidebar of a photo, a video or a document: a link
 * for someone without an account, which opens that file alone. Editors make
 * it (after saying what it gives) and cut it; everyone on the map can copy
 * one that exists.
 */
export function PublicLinkSection({ publicPath, canEdit, photo = false, onChange }: {
  publicPath: string | null | undefined
  canEdit: boolean
  /** A photo goes out without its GPS position: the sidebar says so. */
  photo?: boolean
  /** Saves `public_link`; resolves false when the server refused. */
  onChange: (on: boolean) => Promise<boolean | void>
}) {
  if (!publicPath && !canEdit) return null

  async function make() {
    const yes = await confirmAction({ title: t('share_link.public.confirm_title'), body: t('share_link.public.confirm_body'), confirmLabel: t('share_link.public.confirm') })
    if (!yes) return
    if ((await onChange(true)) !== false) toast(t('share_link.public.created'), { tone: 'success' })
  }

  async function cut() {
    const yes = await confirmAction({ title: t('share_link.public.cut_confirm_title'), body: t('share_link.public.cut_confirm_body'), confirmLabel: t('share_link.public.cut'), tone: 'danger' })
    if (!yes) return
    if ((await onChange(false)) !== false) toast(t('share_link.public.cut_done'))
  }

  return (
    <section aria-label={t('share_link.public.title')} className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-loam-700">
        <Globe className="h-4 w-4 text-leaf-600" aria-hidden />{t('share_link.public.title')}
      </h3>
      <p className="text-sm text-loam-600">{t(photo ? 'share_link.public.intro_photo' : 'share_link.public.intro')}</p>
      {publicPath ? (
        <>
          <CopyField value={absoluteUrl(publicPath)} end />
          {canEdit && <Button size="sm" variant="danger-ghost" className="-ml-3" onClick={() => void cut()}>{t('share_link.public.cut')}</Button>}
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => void make()}>
          <Globe className="h-4 w-4" aria-hidden />{t('share_link.public.create')}
        </Button>
      )}
    </section>
  )
}
