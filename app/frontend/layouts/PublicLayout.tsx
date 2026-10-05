import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'
import { Flash } from '@/components/ui/Flash'
import { Wordmark } from '@/components/Logo'
import { MetaHead } from '@/components/MetaHead'
import { buttonClass } from '@/components/ui/Button'
import { PublicFooter } from '@/components/site/PublicFooter'
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
      <header className="border-b border-loam-900/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center" aria-label="Semisto Designer">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-6 text-[0.95rem] font-medium text-loam-700 md:flex" aria-label={t('site.nav.menu')}>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="border-b-2 border-transparent py-1 transition-colors hover:border-prune-600 hover:text-prune-600">{t(item.label)}</Link>
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
      <PublicFooter />
    </div>
  )
}
