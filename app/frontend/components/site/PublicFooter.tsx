import { Link } from '@inertiajs/react'
import { Wordmark } from '@/components/Logo'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'

/** The public site's footer, shared by PublicLayout and the home page. */
export function PublicFooter() {
  return (
    <footer className="relative z-10 border-t border-loam-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center" aria-label="Semisto Designer">
            <Wordmark />
          </Link>
          <p className="mt-3 max-w-xs text-sm text-loam-500">{tf('site.footer.tagline')}</p>
        </div>
        <nav aria-label={t('site.footer.product')}>
          <h2 className="font-sans text-sm font-semibold text-loam-900">{t('site.footer.product')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-loam-500">
            <li><Link href="/fonctionnalites" className="hover:text-loam-900">{t('public.nav.features')}</Link></li>
            <li><Link href="/tarifs" className="hover:text-loam-900">{t('public.nav.pricing')}</Link></li>
            <li><Link href="/mission-drone" className="hover:text-loam-900">{t('site.footer.drone')}</Link></li>
            <li><Link href="/help" className="hover:text-loam-900">{t('public.nav.help')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('site.footer.about')}>
          <h2 className="font-sans text-sm font-semibold text-loam-900">{t('site.footer.about')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-loam-500">
            <li><Link href="/open-source" className="hover:text-loam-900">{t('public.footer.license')}</Link></li>
            <li><Link href="/confidentialite" className="hover:text-loam-900">{t('public.footer.privacy')}</Link></li>
            <li><Link href="/conditions" className="hover:text-loam-900">{t('public.footer.terms')}</Link></li>
            <li><a href="https://www.semisto.org" className="hover:text-loam-900">semisto.org</a></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-loam-100">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-loam-400">{t('site.footer.rights')}</p>
      </div>
    </footer>
  )
}
