import { router, usePage } from '@inertiajs/react'
import { Gift, Leaf, ShieldCheck, ShieldOff, UserRoundCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { PlanGift } from '@/components/admin/PlanGift'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'
import type { AdminUserRow } from '@/types/admin'

type Props = {
  user: AdminUserRow
  /**
   * The accounts table: four icon buttons, always in the same slots so they line
   * up from row to row, and « Offrir une formule » opens below the row (onGive).
   */
  onGive?: () => void
}

function IconButton({ label, pressed, onClick, className, children }: {
  label: string; pressed?: boolean; onClick: () => void; className?: string; children: ReactNode
}) {
  return (
    <Button
      size="sm" variant="ghost" onClick={onClick} title={label} aria-label={label} aria-pressed={pressed}
      className={className ?? 'h-9 w-9 px-0!'}
    >
      {children}
    </Button>
  )
}

/**
 * « Se connecter en tant que » asks why first: at the person's request or for
 * an abuse, plus a note. The server refuses without both and logs them.
 */
function ImpersonateDialog({ user, open, onClose }: { user: AdminUserRow; open: boolean; onClose: () => void }) {
  const [motive, setMotive] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const ready = motive !== '' && note.trim() !== ''
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setSending(true)
    router.post(`/admin/users/${user.id}/impersonation`, { motive, motive_note: note.trim() }, { onFinish: () => setSending(false) })
  }
  return (
    <Dialog open={open} onClose={onClose} dismissOnBackdrop={false} title={t('admin.impersonation.motive.title', { name: user.name })}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-loam-600">{t('admin.impersonation.motive.intro')}</p>
        <Field label={t('admin.impersonation.motive.label')}>
          <Select value={motive} onChange={(e) => setMotive(e.target.value)} required>
            <option value="" disabled>{t('admin.impersonation.motive.choose')}</option>
            <option value="request">{t('admin.impersonation.motive.request')}</option>
            <option value="abuse">{t('admin.impersonation.motive.abuse')}</option>
          </Select>
        </Field>
        <Field label={t('admin.impersonation.motive.note_label')} hint={t('admin.impersonation.motive.note_hint')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} required />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('admin.impersonation.motive.cancel')}</Button>
          <Button type="submit" disabled={!ready || sending}>{t('admin.impersonation.motive.submit')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** « Se connecter en tant que », the admin role, the catalogue reviewer role and « Offrir une formule », for one account. */
export function UserActions({ user, onGive }: Props) {
  const { currentUser } = usePage().props as unknown as SharedProps
  const self = currentUser?.id === user.id
  const aligned = Boolean(onGive)

  const [asking, setAsking] = useState(false)
  const impersonate = () => setAsking(true)
  const dialog = <ImpersonateDialog user={user} open={asking} onClose={() => setAsking(false)} />
  const toggleAdmin = () => {
    const message = user.admin ? t('admin.users.confirm_revoke', { name: user.name }) : t('admin.users.confirm_grant', { name: user.name })
    if (!window.confirm(message)) return
    router.patch(`/admin/users/${user.id}`, { admin: !user.admin }, { preserveScroll: true })
  }
  const toggleReviewer = () => {
    const key = user.catalogueReviewer ? 'confirm_revoke_reviewer' : 'confirm_grant_reviewer'
    if (!window.confirm(t(`admin.users.${key}`, { name: user.name }))) return
    router.patch(`/admin/users/${user.id}`, { catalogue_reviewer: !user.catalogueReviewer }, { preserveScroll: true })
  }
  const revokeGift = () => {
    if (!window.confirm(t('admin.plan_gifts.confirm_revoke', { name: user.name }))) return
    router.post(`/admin/plan-gifts/${user.gift!.id}/revoke`, {}, { preserveScroll: true })
  }

  const canImpersonate = !self && !user.admin
  const adminLabel = user.admin ? t('admin.users.revoke_admin') : t('admin.users.grant_admin')
  const adminButton = !self && (
    <IconButton label={adminLabel} onClick={toggleAdmin}>
      {user.admin ? <ShieldOff className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
    </IconButton>
  )
  const reviewerButton = (
    <IconButton
      label={user.catalogueReviewer ? t('admin.users.revoke_reviewer') : t('admin.users.grant_reviewer')}
      pressed={user.catalogueReviewer} onClick={toggleReviewer}
      className={user.catalogueReviewer ? 'h-9 w-9 px-0! bg-leaf-100 text-leaf-800 hover:bg-leaf-200' : undefined}
    >
      <Leaf className="h-4 w-4" aria-hidden />
    </IconButton>
  )

  if (aligned) {
    const giftButton = user.gift ? (
      <IconButton
        label={t('admin.plan_gifts.revoke_label')} pressed onClick={revokeGift}
        className="h-9 w-9 px-0! bg-leaf-100 text-leaf-800 hover:bg-leaf-200"
      >
        <Gift className="h-4 w-4" aria-hidden />
      </IconButton>
    ) : (
      <IconButton label={t('admin.plan_gifts.give')} onClick={onGive!}><Gift className="h-4 w-4" aria-hidden /></IconButton>
    )
    // Empty slots keep every icon in its column.
    return (
      <div className="grid w-fit grid-cols-[repeat(4,2.25rem)] gap-1">
        {canImpersonate ? (
          <IconButton label={t('admin.users.impersonate')} onClick={impersonate}><UserRoundCheck className="h-4 w-4" aria-hidden /></IconButton>
        ) : <span />}
        {adminButton || <span />}
        {reviewerButton}
        {giftButton}
        {dialog}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canImpersonate && (
        <Button size="sm" variant="secondary" onClick={impersonate}>
          <UserRoundCheck className="h-4 w-4" aria-hidden />
          {t('admin.users.impersonate')}
        </Button>
      )}
      {adminButton}
      {reviewerButton}
      <PlanGift user={user} />
      {dialog}
    </div>
  )
}

export function PlanBadge({ plan }: { plan: AdminUserRow['plan'] }) {
  return (
    <span className={plan === 'free' ? 'text-loam-500' : 'rounded-full bg-leaf-100 px-2 py-0.5 text-sm font-medium text-leaf-800'}>
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
