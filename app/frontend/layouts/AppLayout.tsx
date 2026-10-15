import { Link, usePage } from '@inertiajs/react'
import { LifeBuoy, Search, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { AccountMenu } from '@/components/AccountMenu'
import { Flash } from '@/components/ui/Flash'
import { Wordmark } from '@/components/Logo'
import { t } from '@/lib/i18n'
import { openQuickSwitcher, shortcutLabel } from '@/quick_switcher/QuickSwitcher'
import type { SharedProps } from '@/types'
import type { TeamAwareUser } from '@/types/teams'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { currentUser, releaseNotes } = usePage().props as unknown as SharedProps
  const unseen = releaseNotes?.unseen ?? 0
  const url = usePage().url
  const newRequests = (currentUser as TeamAwareUser | null)?.newRequests
  const nav = [
    { href: '/maps', label: t('nav.maps') },
    ...(currentUser ? [{ href: '/tasks', label: t('tasks.nav') }] : []),
    ...((currentUser as TeamAwareUser | null)?.teamsCount ? [{ href: '/teams', label: t('teams.nav') }] : []),
    ...(newRequests != null ? [{ href: '/request_forms', label: t('request_forms.nav'), dot: newRequests > 0 }] : []),
    { href: '/plants', label: t('nav.plants') },
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
          <div className="ml-auto flex shrink-0 items-center gap-1 text-sm sm:gap-2">
            {currentUser && (
              <button
                type="button"
                onClick={openQuickSwitcher}
                title={`${t('quick_switcher.open')} (${shortcutLabel()})`}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-loam-500 hover:bg-prune-50 hover:text-prune-700"
              >
                <Search className="h-4 w-4" aria-hidden />
                <span className="sr-only">{t('quick_switcher.open')}</span>
                <kbd className="hidden rounded-md border border-loam-900/15 px-1.5 font-sans text-sm leading-5 text-loam-500 lg:block">{shortcutLabel()}</kbd>
              </button>
            )}
            {/* Help and news are not tools: they sit with the account, apart from the features. */}
            <AsideLink href="/help" label={t('nav.help')} active={url.startsWith('/help')} icon={<LifeBuoy className="h-4 w-4" aria-hidden />} />
            {currentUser && (
              <AsideLink href="/nouveautes" label={t('release_notes.nav')} active={url.startsWith('/nouveautes')} icon={<Sparkles className="h-4 w-4" aria-hidden />}>
                {unseen > 0 && (
                  <>
                    <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-humus-400 ring-2 ring-white sm:static sm:-ml-0.5 sm:inline-block sm:-translate-y-1.5" />
                    <span className="sr-only">{t('release_notes.nav_unseen', { count: unseen })}</span>
                  </>
                )}
              </AsideLink>
            )}
            {currentUser && <span aria-hidden className="mx-1 h-6 w-px bg-loam-900/10 sm:mx-2" />}
            {currentUser && <AccountMenu user={currentUser} />}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}

// A quiet link on the account side: icon only on a phone, icon and words above.
function AsideLink({ href, label, icon, active, children }: { href: string; label: string; icon: ReactNode; active: boolean; children?: ReactNode }) {
  return (
    <Link
      href={href}
      title={label}
      className={
        'relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 ' +
        (active ? 'bg-prune-50 text-prune-700' : 'text-loam-500 hover:bg-prune-50 hover:text-prune-700')
      }
    >
      {icon}
      <span className="sr-only sm:not-sr-only">{label}</span>
      {children}
    </Link>
  )
}
