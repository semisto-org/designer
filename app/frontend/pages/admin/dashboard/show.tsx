import { Head, Link } from '@inertiajs/react'
import { ArrowRight, Inbox, Landmark, Map as MapIcon, Sparkles, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Avatar, PlanBadge, UserActions } from '@/components/admin/UserActions'
import { Card } from '@/components/ui/Card'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { formatDate, formatPrice } from '@/lib/money'
import { relativeTime } from '@/lib/relativeTime'
import type { AdminEventRow, AdminMapRow, AdminStats, AdminUserRow, PlanKey } from '@/types/admin'

type Props = {
  stats: AdminStats
  recentUsers: AdminUserRow[]
  recentMaps: AdminMapRow[]
  events: AdminEventRow[]
}

/** Super admin home: the figures of the service and what waits on Semisto. */
export default function AdminDashboard({ stats, recentUsers, recentMaps, events }: Props) {
  const { users, maps, activity, plans, revenue, inbox } = stats
  return (
    <div>
      <Head title={t('admin.dashboard.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.dashboard.title')}</h1>
      <p className="mt-1 text-loam-500">{t('admin.dashboard.intro')}</p>

      {(inbox.serviceRequests > 0 || inbox.invoiceRequests > 0) && (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl bg-humus-50 px-4 py-3 text-sm ring-1 ring-humus-200">
          <Inbox className="h-4 w-4 text-humus-700" aria-hidden />
          <span className="font-medium text-loam-800">{t('admin.dashboard.inbox.title')} :</span>
          {inbox.serviceRequests > 0 && (
            <Link href="/admin/requests" className="rounded-full bg-white px-3 py-1 text-prune-700 ring-1 ring-humus-200 hover:bg-humus-100">
              {t('admin.dashboard.inbox.service_requests', { count: inbox.serviceRequests })}
            </Link>
          )}
          {inbox.invoiceRequests > 0 && (
            <Link href="/admin/invoice-requests" className="rounded-full bg-white px-3 py-1 text-prune-700 ring-1 ring-humus-200 hover:bg-humus-100">
              {t('admin.dashboard.inbox.invoice_requests', { count: inbox.invoiceRequests })}
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={<Users className="h-4 w-4" />} title={t('admin.dashboard.users.title')} value={formatNumber(users.total)}>
          <p>{t('admin.dashboard.users.new', { week: users.new7d, month: users.new30d })}</p>
          <p>{t('admin.dashboard.users.active', { count: users.active30d })} · {t('admin.dashboard.users.teams', { count: users.inTeams })}</p>
        </Stat>
        <Stat icon={<MapIcon className="h-4 w-4" />} title={t('admin.dashboard.maps.title')} value={formatNumber(maps.total)}>
          <p>{t('admin.dashboard.maps.new', { count: maps.new30d })}</p>
          <p>{t('admin.dashboard.maps.details', { area: formatNumber(maps.areaHa), published: maps.published, archived: maps.archived })}</p>
        </Stat>
        <Stat icon={<Sparkles className="h-4 w-4" />} title={t('admin.dashboard.activity.title')} value={formatNumber(activity.features30d)}>
          <p>{t('admin.dashboard.activity.features', { count: activity.features30d, total: formatNumber(activity.features) })}</p>
          <p>{t('admin.dashboard.activity.ai', { count: activity.aiActions30d, users: activity.aiUsers30d })}</p>
          <p>{t('admin.dashboard.activity.drafts', { count: activity.aiDrafts })} · {t('admin.dashboard.activity.comments', { count: activity.comments30d })}</p>
        </Stat>
        <Stat icon={<Landmark className="h-4 w-4" />} title={t('admin.dashboard.plans.title')} value={formatNumber(plans.paying)}>
          <p>{t('admin.dashboard.plans.paying')}</p>
          {plans.paying === 0 ? (
            <p>{t('admin.dashboard.plans.none')}</p>
          ) : (
            <p className="flex flex-wrap gap-1.5">
              {(Object.entries(plans.byPlan) as [PlanKey, number][]).map(([plan, count]) => (
                <span key={plan}><PlanBadge plan={plan} /> {count}</span>
              ))}
            </p>
          )}
          {!plans.billingEnabled && <p className="text-humus-700">{t('admin.dashboard.plans.beta')}</p>}
        </Stat>
        <Stat icon={<Wallet className="h-4 w-4" />} title={t('admin.dashboard.revenue.title')} value={formatPrice(revenue.year)}>
          <p>{t('admin.dashboard.revenue.year')}</p>
          <p>{t('admin.dashboard.revenue.last30d', { amount: formatPrice(revenue.last30d), count: revenue.count })}</p>
        </Stat>
        <Card>
          <h2 className="font-sans text-sm font-medium text-loam-500">{t('admin.dashboard.regions.title')}</h2>
          {stats.mapsByRegion.length === 0 && <p className="mt-2 text-sm text-loam-500">{t('admin.dashboard.no_maps')}</p>}
          <ul className="mt-2 space-y-1 text-sm">
            {stats.mapsByRegion.map((row) => (
              <li key={row.region} className="flex justify-between gap-3">
                <span className="text-loam-700">{row.region}</span>
                <span className="font-medium text-loam-900">{formatNumber(row.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <SignupsChart weeks={stats.signupsByWeek} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl">{t('admin.dashboard.recent_users')}</h2>
            <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-prune-700 hover:underline">
              {t('admin.dashboard.all_users')}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <Card className="mt-3 p-0!">
            <ul className="divide-y divide-loam-100">
              {recentUsers.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar user={user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-loam-900">{user.name}</p>
                    <p className="truncate text-xs text-loam-500">
                      {user.email} · {relativeTime(user.createdAt)} · <PlanBadge plan={user.plan} />
                    </p>
                  </div>
                  <UserActions user={user} />
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <h2 className="text-xl">{t('admin.dashboard.recent_maps')}</h2>
          {recentMaps.length === 0 && <p className="mt-2 text-sm text-loam-500">{t('admin.dashboard.no_maps')}</p>}
          <Card className={recentMaps.length === 0 ? 'hidden' : 'mt-3 p-0!'}>
            <ul className="divide-y divide-loam-100">
              {recentMaps.map((map) => (
                <li key={map.id} className="px-4 py-3">
                  <p className="flex items-center gap-2 font-medium text-loam-900">
                    <span className="truncate">{map.name}</span>
                    {map.archived && <span className="rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600">{t('admin.dashboard.archived')}</span>}
                  </p>
                  <p className="truncate text-xs text-loam-500">
                    {t('admin.dashboard.map_owner', { name: map.owner.name })} · {[map.region, formatArea(map.areaM2), relativeTime(map.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-xl">{t('admin.dashboard.events.title')}</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-loam-500">{t('admin.dashboard.events.empty')}</p>
        ) : (
          <Card className="mt-3 p-0!">
            <ul className="divide-y divide-loam-100 text-sm">
              {events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <p className="text-loam-700">
                    <span className="font-medium text-loam-900">{event.admin.name ?? '—'}</span>{' '}
                    {t(`admin.dashboard.events.actions.${event.action}`)}{' '}
                    <span className="font-medium text-loam-900">{event.target?.name ?? '—'}</span>
                    {event.reason && <span className="text-loam-500"> {t(`admin.dashboard.events.reasons.${event.reason}`)}</span>}
                  </p>
                  <time dateTime={event.createdAt} title={formatDate(event.createdAt)} className="shrink-0 text-xs text-loam-500">
                    {relativeTime(event.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}

function Stat({ icon, title, value, children }: { icon: ReactNode; title: string; value: string; children?: ReactNode }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-sans text-sm font-medium text-loam-500">
        <span className="text-prune-500" aria-hidden>{icon}</span>{title}
      </h2>
      <p className="mt-1 font-serif text-3xl font-semibold text-prune-800">{value}</p>
      <div className="mt-2 space-y-0.5 text-sm text-loam-600">{children}</div>
    </Card>
  )
}

/** Sign-ups per week, last 12 weeks: plain bars, the count in each title. */
function SignupsChart({ weeks }: { weeks: AdminStats['signupsByWeek'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count))
  return (
    <Card className="mt-4">
      <h2 className="font-sans text-sm font-medium text-loam-500">{t('admin.dashboard.signups.title')}</h2>
      <div className="mt-3 flex h-28 items-end gap-1.5">
        {weeks.map((week) => {
          const label = t('admin.dashboard.signups.week', { date: formatDate(week.week), count: week.count })
          return (
            <div key={week.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={label}>
              <span className="text-xs text-loam-500">{week.count > 0 ? week.count : ''}</span>
              <div
                className="w-full rounded-t-md bg-prune-500"
                style={{ height: `${Math.max(week.count > 0 ? 6 : 2, (week.count / max) * 85)}%` }}
                role="img" aria-label={label}
              />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
