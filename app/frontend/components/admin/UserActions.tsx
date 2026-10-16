import { router, usePage } from '@inertiajs/react'
import { Leaf, ShieldCheck, ShieldOff, UserRoundCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'
import type { AdminUserRow } from '@/types/admin'

/** « Se connecter en tant que », the admin role and the catalogue reviewer role, for one account. */
export function UserActions({ user }: { user: AdminUserRow }) {
  const { currentUser } = usePage().props as unknown as SharedProps

  const toggleReviewer = () => {
    const key = user.catalogueReviewer ? 'confirm_revoke_reviewer' : 'confirm_grant_reviewer'
    if (!window.confirm(t(`admin.users.${key}`, { name: user.name }))) return
    router.patch(`/admin/users/${user.id}`, { catalogue_reviewer: !user.catalogueReviewer }, { preserveScroll: true })
  }
  const reviewerLabel = user.catalogueReviewer ? t('admin.users.revoke_reviewer') : t('admin.users.grant_reviewer')
  const reviewerButton = (
    <Button
      size="sm" variant="ghost" onClick={toggleReviewer} title={reviewerLabel} aria-label={reviewerLabel}
      aria-pressed={user.catalogueReviewer}
      className={user.catalogueReviewer ? 'text-leaf-700' : undefined}
    >
      <Leaf className="h-4 w-4" aria-hidden />
    </Button>
  )
  if (currentUser?.id === user.id) return <div className="flex flex-wrap items-center gap-1.5">{reviewerButton}</div>

  const toggleAdmin = () => {
    const message = user.admin ? t('admin.users.confirm_revoke', { name: user.name }) : t('admin.users.confirm_grant', { name: user.name })
    if (!window.confirm(message)) return
    router.patch(`/admin/users/${user.id}`, { admin: !user.admin }, { preserveScroll: true })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!user.admin && (
        <Button size="sm" variant="secondary" onClick={() => router.post(`/admin/users/${user.id}/impersonation`)}>
          <UserRoundCheck className="h-4 w-4" aria-hidden />
          {t('admin.users.impersonate')}
        </Button>
      )}
      <Button
        size="sm" variant="ghost" onClick={toggleAdmin}
        title={user.admin ? t('admin.users.revoke_admin') : t('admin.users.grant_admin')}
        aria-label={user.admin ? t('admin.users.revoke_admin') : t('admin.users.grant_admin')}
      >
        {user.admin ? <ShieldOff className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
      </Button>
      {reviewerButton}
    </div>
  )
}

export function PlanBadge({ plan }: { plan: AdminUserRow['plan'] }) {
  return (
    <span className={plan === 'free' ? 'text-loam-500' : 'rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-medium text-leaf-800'}>
      {t(`account.plan_names.${plan}`)}
    </span>
  )
}

export function Avatar({ user }: { user: Pick<AdminUserRow, 'name' | 'avatarUrl'> }) {
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-prune-100 text-xs font-semibold text-prune-700">
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  )
}
