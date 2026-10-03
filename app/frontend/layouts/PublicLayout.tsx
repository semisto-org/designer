import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'
import { Flash } from '@/components/ui/Flash'
import { Logo } from '@/components/Logo'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { currentUser } = usePage().props as unknown as SharedProps
  return (
    <div className="flex min-h-dvh flex-col">
      <Flash />
      <header className="border-b border-loam-200/70 bg-loam-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-loam-900">
            <Logo />
            <span>Semisto Designer</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-loam-600 md:flex">
            <Link href="/fonctionnalites" className="hover:text-loam-900">{t('public.nav.features')}</Link>
            <Link href="/tarifs" className="hover:text-loam-900">{t('public.nav.pricing')}</Link>
            <Link href="/help" className="hover:text-loam-900">{t('public.nav.help')}</Link>
            <Link href="/open-source" className="hover:text-loam-900">{t('public.nav.open_source')}</Link>
          </nav>
          <div className="ml-auto">
            {currentUser ? (
              <Link href="/maps" className={buttonClass('primary', 'sm')}>{t('public.nav.my_maps')}</Link>
            ) : (
              <Link href="/session/new" className={buttonClass('primary', 'sm')}>{t('public.nav.sign_in')}</Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-loam-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-loam-500">
          <span>© Semisto ASBL</span>
          <Link href="/open-source" className="hover:text-loam-800">{t('public.footer.license')}</Link>
          <Link href="/confidentialite" className="hover:text-loam-800">{t('public.footer.privacy')}</Link>
          <Link href="/conditions" className="hover:text-loam-800">{t('public.footer.terms')}</Link>
          <a href="https://www.semisto.org" className="hover:text-loam-800">semisto.org</a>
        </div>
      </footer>
    </div>
  )
}
