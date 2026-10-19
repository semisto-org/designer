import { Head, Link, router } from '@inertiajs/react'
import { Gift, Search } from 'lucide-react'
import { useState } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { PlanGiftAll, PlanGiftForm } from '@/components/admin/PlanGift'
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

// One grid for the header and every row, so each column lines up whatever the
// name, the badges or the buttons a row has. Below lg a row stacks instead.
const ROW_GRID = 'px-4 lg:grid-cols-[minmax(0,1fr)_14rem_7rem_9rem_9.75rem] lg:items-center lg:gap-6'

function UserRow({ user }: { user: AdminUserRow }) {
  const [giving, setGiving] = useState(false)

  return (
    <li className="py-3">
      <div className={`${ROW_GRID} flex flex-col gap-3 lg:grid`}>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={user} />
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2 font-medium text-loam-900">
              <span className="truncate" title={user.name}>{user.name}</span>
              {user.admin && <span className="shrink-0 rounded-full bg-prune-100 px-2 text-sm font-normal text-prune-700">{t('admin.users.admin_badge')}</span>}
              {user.catalogueReviewer && <span className="shrink-0 rounded-full bg-leaf-100 px-2 text-sm font-normal text-leaf-800">{t('admin.users.reviewer_badge')}</span>}
              {user.professional && <span className="shrink-0 rounded-full bg-leaf-100 px-2 text-sm font-normal text-leaf-700">{t('account.kind.professional')}</span>}
            </p>
            <p className="truncate text-sm text-loam-500" title={user.email}>
              {user.email}{user.google && <span className="text-loam-400"> · {t('admin.users.google')}</span>}
            </p>
          </div>
        </div>
        {/* lg:contents lets the three values sit in the row's own columns. */}
        <dl className="grid grid-cols-2 gap-3 text-sm lg:contents">
          <div className="col-span-2 min-w-0 lg:col-span-1">
            <dt className="text-loam-400 lg:sr-only">{t('admin.users.columns.plan')}</dt>
            <dd><PlanBadge plan={user.plan} /></dd>
            {user.gift && (
              <dd className="mt-1 flex items-center gap-1 whitespace-nowrap text-leaf-800">
                <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('admin.plan_gifts.gifted_until', { date: formatDate(user.gift.endsAt) })}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-loam-400 lg:sr-only">{t('admin.users.columns.maps')}</dt>
            <dd className="text-loam-700">{t('admin.users.maps_count', { count: user.mapsCount })}</dd>
          </div>
          <div>
            <dt className="text-loam-400 lg:sr-only">{t('admin.users.columns.last_seen')}</dt>
            <dd className="text-loam-700" title={t('admin.users.columns.signed_up') + ' : ' + formatDate(user.createdAt)}>
              {user.lastSignedInAt ? relativeTime(user.lastSignedInAt) : t('admin.users.never')}
            </dd>
          </div>
        </dl>
        <UserActions user={user} onGive={() => setGiving(true)} />
      </div>
      {giving && (
        <div className="mx-4 mt-3 rounded-2xl bg-leaf-50 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-leaf-800">
            <Gift className="h-4 w-4" aria-hidden />{t('admin.plan_gifts.give_to', { name: user.name })}
          </p>
          <PlanGiftForm user={user} onClose={() => setGiving(false)} />
        </div>
      )}
    </li>
  )
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
      <PlanGiftAll />

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
          <div className={`${ROW_GRID} hidden border-b border-loam-100 bg-loam-50 py-2 text-sm text-loam-500 lg:grid`} aria-hidden>
            <span>{t('admin.users.columns.person')}</span>
            <span>{t('admin.users.columns.plan')}</span>
            <span>{t('admin.users.columns.maps')}</span>
            <span>{t('admin.users.columns.last_seen')}</span>
            <span className="sr-only">{t('admin.users.columns.actions')}</span>
          </div>
          <ul className="divide-y divide-loam-100">
            {users.map((user) => <UserRow key={user.id} user={user} />)}
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
