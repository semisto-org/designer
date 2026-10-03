import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'
import { Flash } from '@/components/ui/Flash'
import { Logo } from '@/components/Logo'
import { MetaHead } from '@/components/MetaHead'
import { buttonClass } from '@/components/ui/Button'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'

const NAV = [
  { href: '/fonctionnalites', label: 'public.nav.features' },
  { href: '/tarifs', label: 'public.nav.pricing' },
  { href: '/help', label: 'public.nav.help' },
  { href: '/open-source', label: 'public.nav.open_source' },
]

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { currentUser } = usePage().props as unknown as SharedProps
  return (
    <div className="flex min-h-dvh flex-col">
      <MetaHead />
      <Flash />
      <header className="border-b border-loam-200/70 bg-loam-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-loam-900">
            <Logo />
            <span>Semisto Designer</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-loam-600 md:flex" aria-label={t('site.nav.menu')}>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-loam-900">{t(item.label)}</Link>
            ))}
          </nav>
          <div className="ml-auto">
            {currentUser ? (
              <Link href="/maps" className={buttonClass('primary', 'sm')}>{t('public.nav.my_maps')}</Link>
            ) : (
              <Link href="/session/new" className={buttonClass('primary', 'sm')}>{t('public.nav.sign_in')}</Link>
            )}
          </div>
        </div>
        <nav className="border-t border-loam-200/60 md:hidden" aria-label={t('site.nav.menu')}>
          <ul className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 py-2 text-sm text-loam-600">
            {NAV.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link href={item.href} className="hover:text-loam-900">{t(item.label)}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-loam-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold text-loam-900">
              <Logo />
              <span>Semisto Designer</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-loam-500">{tf('site.footer.tagline')}</p>
          </div>
          <nav aria-label={t('site.footer.product')}>
            <h2 className="text-sm font-semibold text-loam-900">{t('site.footer.product')}</h2>
            <ul className="mt-3 space-y-2 text-sm text-loam-500">
              <li><Link href="/fonctionnalites" className="hover:text-loam-900">{t('public.nav.features')}</Link></li>
              <li><Link href="/tarifs" className="hover:text-loam-900">{t('public.nav.pricing')}</Link></li>
              <li><Link href="/mission-drone" className="hover:text-loam-900">{t('site.footer.drone')}</Link></li>
              <li><Link href="/help" className="hover:text-loam-900">{t('public.nav.help')}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t('site.footer.about')}>
            <h2 className="text-sm font-semibold text-loam-900">{t('site.footer.about')}</h2>
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
    </div>
  )
}
