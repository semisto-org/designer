import { Head, Link, router } from '@inertiajs/react'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Avatar, PlanBadge, UserActions } from '@/components/admin/UserActions'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { relativeTime } from '@/lib/relativeTime'
import type { AdminUserRow } from '@/types/admin'

type Props = {
  users: AdminUserRow[]
  filters: { q: string }
  pagination: { page: number; pages: number; total: number }
}

/** Super admin: every account, searchable, with what staff can do with it. */
export default function AdminUsers({ users, filters, pagination }: Props) {
  const [query, setQuery] = useState(filters.q)
  const visit = (q: string) => router.get('/admin/users', q ? { q } : {}, { preserveState: true })

  return (
    <div>
      <Head title={t('admin.users.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.users.title')}</h1>
      <p className="mt-1 text-loam-500">{t('admin.users.intro')}</p>

      <form
        className="mt-6 flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); visit(query.trim()) }}
      >
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden />
          <Input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.users.search')} aria-label={t('admin.users.search')} className="pl-9!"
          />
        </div>
        <Button type="submit" variant="secondary">{t('admin.users.search_button')}</Button>
        <span className="text-sm text-loam-500">{t('admin.users.count', { count: pagination.total })}</span>
      </form>

      {users.length === 0 ? (
        <div className="mt-6"><EmptyState title={t('admin.users.empty')} /></div>
      ) : (
        <Card className="mt-6 overflow-hidden p-0!">
          <ul className="divide-y divide-loam-100">
            {users.map((user) => (
              <li key={user.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={user} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-loam-900">
                      <span className="truncate">{user.name}</span>
                      {user.admin && <span className="rounded-full bg-prune-100 px-2 py-0.5 text-xs text-prune-700">{t('admin.users.admin_badge')}</span>}
                    </p>
                    <p className="truncate text-sm text-loam-500">
                      {user.email}{user.google && <span className="text-loam-400"> · {t('admin.users.google')}</span>}
                    </p>
                  </div>
                </div>
                <dl className="grid shrink-0 grid-cols-3 gap-3 text-sm lg:w-96">
                  <div>
                    <dt className="text-xs text-loam-400">{t('admin.users.columns.plan')}</dt>
                    <dd><PlanBadge plan={user.plan} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-loam-400">{t('admin.users.columns.maps')}</dt>
                    <dd className="text-loam-700">{t('admin.users.maps_count', { count: user.mapsCount })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-loam-400">{t('admin.users.columns.last_seen')}</dt>
                    <dd className="text-loam-700" title={t('admin.users.columns.signed_up') + ' : ' + formatDate(user.createdAt)}>
                      {user.lastSignedInAt ? relativeTime(user.lastSignedInAt) : t('admin.users.never')}
                    </dd>
                  </div>
                </dl>
                <div className="lg:ml-auto"><UserActions user={user} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {pagination.page > 1 ? (
            <Link href="/admin/users" data={{ ...(filters.q ? { q: filters.q } : {}), page: pagination.page - 1 }} className="text-prune-700 hover:underline">
              {t('admin.users.previous')}
            </Link>
          ) : <span />}
          <span className="text-loam-500">{t('admin.users.page', { page: pagination.page, pages: pagination.pages })}</span>
          {pagination.page < pagination.pages ? (
            <Link href="/admin/users" data={{ ...(filters.q ? { q: filters.q } : {}), page: pagination.page + 1 }} className="text-prune-700 hover:underline">
              {t('admin.users.next')}
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  )
}
