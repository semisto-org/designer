import { Link, usePage } from '@inertiajs/react'
import { ListChecks } from 'lucide-react'
import { AccountMenu } from '@/components/AccountMenu'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { t } from '@/lib/i18n'
import type { CurrentUser } from '@/types'

/**
 * A page with its own action bar along the bottom (a save bar, a selection)
 * marks it `data-page-bar` (or `data-page-bar-mobile` when that bar shows on
 * a phone only): the My Bar and the « Un retour ? » circle step aside for it.
 */
export const STEPS_ASIDE_FOR_PAGE_BAR = '[body:has([data-page-bar])_&]:hidden max-lg:[body:has([data-page-bar-mobile])_&]:hidden'

/**
 * The « My Bar » (Michael, 2026-11-10): what concerns me, fixed at the bottom
 * of the app's pages, so the header keeps only the features. It opens with
 * my account, then my tasks and my bell; whatever else is personal joins it
 * here rather than in the header. Its menus open upwards.
 */
export function MyBar({ user }: { user: CurrentUser }) {
  const url = usePage().url
  const tasksActive = url === '/tasks' || url.startsWith('/tasks?') || url.startsWith('/tasks/')
  return (
    <nav
      aria-label={t('my_bar.label')}
      className={'pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-5 print:hidden ' + STEPS_ASIDE_FOR_PAGE_BAR}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/95 p-1 pr-1.5 text-sm shadow-lg ring-1 ring-loam-900/10 backdrop-blur">
        <AccountMenu user={user} placement="up" />
        <span aria-hidden className="mx-1 h-6 w-px bg-loam-900/10" />
        <Link
          href="/tasks"
          aria-current={tasksActive ? 'page' : undefined}
          className={
            'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-medium ' +
            (tasksActive ? 'bg-prune-50 text-prune-700' : 'text-loam-600 hover:bg-prune-50 hover:text-prune-700')
          }
        >
          <ListChecks className="h-4 w-4" aria-hidden />
          {t('tasks.nav')}
        </Link>
        <NotificationBell placement="up" />
      </div>
    </nav>
  )
}
