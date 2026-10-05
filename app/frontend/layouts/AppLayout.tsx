import { Link, usePage } from '@inertiajs/react'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { Flash } from '@/components/ui/Flash'
import { Wordmark } from '@/components/Logo'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'
import type { TeamAwareUser } from '@/types/teams'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { currentUser } = usePage().props as unknown as SharedProps
  const url = usePage().url
  const nav = [
    { href: '/maps', label: t('nav.maps') },
    ...((currentUser as TeamAwareUser | null)?.teamsCount ? [{ href: '/teams', label: t('teams.nav') }] : []),
    { href: '/plants', label: t('nav.plants') },
    { href: '/help', label: t('nav.help') },
    ...(currentUser?.admin ? [{ href: '/admin', label: t('admin.nav.link') }] : []),
  ]
  return (
    <div className="min-h-dvh">
      <Flash />
      <header className="border-b border-loam-900/10 bg-white/90 backdrop-blur">
        {/* On a phone the menu takes its own row under the logo and the account. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 px-4 pt-2 sm:h-14 sm:flex-nowrap sm:gap-6 sm:pt-0">
          <Link href="/maps" className="flex h-10 items-center sm:h-auto" aria-label="Semisto Designer">
            {/* One lockup: a `hidden` class on it would fight its own inline-flex. */}
            <Wordmark compact="mobile" />
          </Link>
          <nav className="order-last -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 pb-2 text-sm sm:order-none sm:w-auto sm:pb-0">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 font-medium sm:px-3 ' +
                  (url.startsWith(item.href) ? 'bg-prune-50 text-prune-700' : 'text-loam-600 hover:bg-prune-50 hover:text-prune-700')
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
            {currentUser && (
              <>
                <Link href="/account" className="flex items-center gap-2 text-loam-600 hover:text-loam-900">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-prune-100 text-xs font-semibold text-prune-700">
                      {currentUser.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden sm:inline">{currentUser.name}</span>
                </Link>
                <Link
                  href="/session"
                  method="delete"
                  as="button"
                  className="text-loam-500 hover:text-loam-900"
                  aria-label={t('nav.sign_out')}
                  title={t('nav.sign_out')}
                >
                  <LogOut className="h-4 w-4 sm:hidden" aria-hidden />
                  <span className="hidden sm:inline">{t('nav.sign_out')}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
