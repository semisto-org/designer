import { Head, Link } from '@inertiajs/react'
import { ShieldAlert } from 'lucide-react'
import { t } from '@/lib/i18n'
import PublicLayout from '@/layouts/PublicLayout'

/** A connection request we refuse to process (unknown client, foreign redirect). */
export default function OauthError({ reason }: { reason: 'unknown_client' | 'bad_redirect' }) {
  return (
    <div className="px-4 py-16">
      <Head title={t('oauth.error.title')} />
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-loam-200/70">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-clay-50 text-clay-500">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl">{t('oauth.error.title')}</h1>
        <p className="mt-2 text-sm text-loam-600">{t(`oauth.error.${reason}`)}</p>
        <Link href="/account/ai" className="mt-6 inline-block text-sm font-medium text-prune-600 hover:text-prune-800">
          {t('oauth.error.help')}
        </Link>
      </div>
    </div>
  )
}

OauthError.layout = PublicLayout
