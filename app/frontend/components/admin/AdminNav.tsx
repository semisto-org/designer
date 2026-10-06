import { Link, usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { t } from '@/lib/i18n'

const ITEMS = [
  { href: '/admin', key: 'dashboard', exact: true },
  { href: '/admin/users', key: 'users' },
  { href: '/admin/maps', key: 'maps' },
  { href: '/admin/requests', key: 'requests' },
  { href: '/admin/invoice-requests', key: 'invoices' },
  { href: '/admin/drone-views', key: 'drone' },
] as const

/** Tabs between the staff screens. */
export function AdminNav() {
  const path = usePage().url.split('?')[0]
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1 pb-1" aria-label={t('admin.nav.link')}>
      {ITEMS.map((item) => {
        const active = 'exact' in item ? path === item.href : path.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50',
            )}
          >
            {t(`admin.nav.${item.key}`)}
          </Link>
        )
      })}
    </nav>
  )
}
