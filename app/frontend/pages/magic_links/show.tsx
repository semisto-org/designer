import { Head } from '@inertiajs/react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { t } from '@/lib/i18n'

// The magic link lands here. Mail apps open links to preview them, so the
// link itself signs no one in: this button does (a POST).
export default function MagicLinkConfirm({ email, action }: { email: string; action: string }) {
  const csrf = typeof document !== 'undefined'
    ? document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content
    : ''

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Head title={t('magic_links.show.title')} />
      <h1 className="text-2xl">{t('magic_links.show.title')}</h1>
      <Card className="mt-8 space-y-6">
        <p className="text-loam-700">{t('magic_links.show.intro', { email })}</p>
        <form method="post" action={action}>
          <input type="hidden" name="authenticity_token" value={csrf} />
          <Button type="submit" className="w-full" size="lg" autoFocus>
            {t('magic_links.show.submit')}
          </Button>
        </form>
        <p className="text-xs text-loam-400">{t('magic_links.show.why')}</p>
      </Card>
    </div>
  )
}
