import { Head, Link, router, useForm } from '@inertiajs/react'
import { ArrowLeft, LogOut, Mail, MapPinned, Pencil, RefreshCw, Trash2, UserMinus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/collab/Avatar'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatArea, t } from '@/lib/i18n'
import type { TeamInvitation, TeamMap, TeamMember, TeamPageProps, TeamRole } from '@/types/teams'

const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
const formatDate = (iso: string) => dateFormat.format(new Date(iso))

/** A team's page: members and roles, invitations, the team's maps, leaving. */
export default function TeamShow({ team, members, maps, invitations, maxNameLength }: TeamPageProps) {
  const admin = team.role === 'admin'
  const base = `/teams/${team.id}`
  const me = members.find((m) => m.you)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={team.name} />
      <Link href="/teams" className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('teams.show.back')}
      </Link>

      <TeamHeader team={team} admin={admin} base={base} maxNameLength={maxNameLength} />

      <Members members={members} admin={admin} base={base} />
      {admin && <Invite invitations={invitations ?? []} base={base} />}
      <Maps maps={maps} />
      {me && <Leave team={team} me={me} />}
      {admin && <DeleteTeam team={team} base={base} />}
    </div>
  )
}

function TeamHeader({ team, admin, base, maxNameLength }: { team: TeamPageProps['team']; admin: boolean; base: string; maxNameLength: number }) {
  const [renaming, setRenaming] = useState(false)
  const form = useForm({ name: team.name })

  if (renaming) {
    return (
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault()
          form.transform((data) => ({ team: { name: data.name } }))
          form.patch(base, { preserveScroll: true, onSuccess: () => setRenaming(false) })
        }}
      >
        <Field label={t('teams.show.rename_title')} error={form.errors.name} className="flex-1">
          <Input value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} maxLength={maxNameLength} required autoFocus />
        </Field>
        <div className="flex gap-2 sm:mt-6">
          <Button type="submit" disabled={form.processing || form.data.name.trim() === ''}>{t('common.save')}</Button>
          <Button variant="ghost" onClick={() => { form.reset(); form.clearErrors(); setRenaming(false) }}>{t('common.cancel')}</Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-prune-50 text-prune-600">
          <UsersRound className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="break-words text-2xl">{team.name}</h1>
          <p className="text-sm text-loam-500">{t('teams.show.your_role', { role: t(`teams.roles.${team.role}`).toLowerCase() })}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <HelpButton slug="travailler-en-equipe" />
        {admin && (
          <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {t('teams.show.rename')}
          </Button>
        )}
      </div>
    </div>
  )
}

function Members({ members, admin, base }: { members: TeamMember[]; admin: boolean; base: string }) {
  return (
    <Card>
      <h2 className="flex items-center justify-between gap-2 text-base">
        <span>{t('teams.show.members_title')}</span>
        <span className="text-sm font-normal text-loam-500">{t('teams.members_count', { count: members.length })}</span>
      </h2>
      <ul className="mt-3 divide-y divide-loam-100">
        {members.map((member) => <MemberRow key={member.id} member={member} admin={admin} base={base} />)}
      </ul>
    </Card>
  )
}

function MemberRow({ member, admin, base }: { member: TeamMember; admin: boolean; base: string }) {
  const [busy, setBusy] = useState(false)
  const options = { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) }
  // Admins manage everyone; their own role too, unless they are the last admin.
  const canChangeRole = admin && !member.lastAdmin
  const canRemove = admin && !member.you

  function remove() {
    let message = t('teams.show.remove_confirm', { name: member.name })
    if (member.mapsCount > 0) message += ` ${t('teams.show.remove_confirm_maps', { count: member.mapsCount })}`
    if (window.confirm(message)) router.delete(`${base}/memberships/${member.id}`, options)
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar name={member.name} url={member.avatarUrl} className="h-9 w-9" />
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium text-loam-900">
          {member.name}
          {member.you && <span className="ml-1.5 text-xs font-normal text-loam-400">{t('teams.show.you')}</span>}
        </p>
        <p className="truncate text-xs text-loam-500">
          {[member.email, member.mapsCount > 0 ? t('teams.show.maps_owned', { count: member.mapsCount }) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {canChangeRole ? (
          <Select
            aria-label={t('teams.show.role_of', { name: member.name })}
            value={member.role}
            disabled={busy}
            className="py-1.5"
            style={{ width: 'auto' }}
            onChange={(e) => router.patch(`${base}/memberships/${member.id}`, { membership: { role: e.target.value } }, options)}
          >
            <option value="member">{t('teams.roles.member')}</option>
            <option value="admin">{t('teams.roles.admin')}</option>
          </Select>
        ) : (
          <span className="rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600" title={member.lastAdmin ? t('teams.show.last_admin') : undefined}>
            {t(`teams.roles.${member.role}`)}
          </span>
        )}
        {canRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-md p-2 text-loam-400 hover:bg-clay-50 hover:text-clay-500 disabled:opacity-50"
            aria-label={t('teams.show.remove', { name: member.name })}
            title={t('teams.show.remove', { name: member.name })}
          >
            <UserMinus className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  )
}

function Invite({ invitations, base }: { invitations: TeamInvitation[]; base: string }) {
  const form = useForm<{ email_address: string; role: TeamRole }>({ email_address: '', role: 'member' })

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-prune-500" aria-hidden="true" />{t('teams.show.invite_title')}</h2>
      <form
        className="mt-4 flex flex-wrap items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          form.transform((data) => ({ invitation: data }))
          form.post(`${base}/invitations`, { preserveScroll: true, onSuccess: () => form.reset('email_address') })
        }}
      >
        <Field error={form.errors.email_address} className="min-w-0 flex-1 basis-56">
          <Input
            type="email"
            required
            value={form.data.email_address}
            onChange={(e) => form.setData('email_address', e.target.value)}
            placeholder={t('teams.show.invite_placeholder')}
            aria-label={t('teams.show.invite_email')}
          />
        </Field>
        <Select
          aria-label={t('teams.show.invite_role')}
          value={form.data.role}
          onChange={(e) => form.setData('role', e.target.value as TeamRole)}
          style={{ width: 'auto' }}
        >
          <option value="member">{t('teams.roles.member')}</option>
          <option value="admin">{t('teams.roles.admin')}</option>
        </Select>
        <Button type="submit" disabled={form.processing || form.data.email_address.trim() === ''}>{t('teams.show.invite_send')}</Button>
      </form>
      <p className="mt-2 text-xs text-loam-500">{t(`teams.role_help.${form.data.role}`)} {t('teams.show.invite_hint')}</p>

      {invitations.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('teams.show.pending')}</h3>
          <ul className="mt-1 divide-y divide-loam-100">
            {invitations.map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} base={base} />)}
          </ul>
        </div>
      )}
    </Card>
  )
}

function InvitationRow({ invitation, base }: { invitation: TeamInvitation; base: string }) {
  const [busy, setBusy] = useState(false)
  const options = { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) }
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate text-loam-900">{invitation.email}</p>
        {invitation.expiresAt && <p className="text-xs text-loam-500">{t('teams.show.expires', { date: formatDate(invitation.expiresAt) })}</p>}
      </div>
      <span className="rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600">{t(`teams.roles.${invitation.role}`)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => router.post(`${base}/invitations/${invitation.id}/resend`, {}, options)}
        className="rounded-md p-2 text-loam-500 hover:bg-loam-100 disabled:opacity-50"
        aria-label={t('teams.show.resend', { email: invitation.email })}
        title={t('teams.show.resend', { email: invitation.email })}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => router.delete(`${base}/invitations/${invitation.id}`, options)}
        className="rounded-md p-2 text-loam-400 hover:bg-clay-50 hover:text-clay-500 disabled:opacity-50"
        aria-label={t('teams.show.cancel_invitation', { email: invitation.email })}
        title={t('teams.show.cancel_invitation', { email: invitation.email })}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

function Maps({ maps }: { maps: TeamMap[] }) {
  return (
    <Card>
      <h2 className="flex items-center justify-between gap-2 text-base">
        <span>{t('teams.show.maps_title')}</span>
        <span className="text-sm font-normal text-loam-500">{t('teams.maps_count', { count: maps.length })}</span>
      </h2>
      {maps.length === 0 ? (
        <p className="mt-3 text-sm text-loam-500">{t('teams.show.maps_empty')}</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-loam-100">
            {maps.map((map) => (
              <li key={map.id}>
                <Link href={`/maps/${map.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-loam-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-600">
                    <MapPinned className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-loam-900">{map.name}</p>
                    <p className="truncate text-xs text-loam-500">
                      {map.ownedByYou
                        ? t('teams.show.owner_you')
                        : map.ownerInTeam ? t('teams.show.owner', { name: map.ownerName }) : t('teams.show.owner_left', { name: map.ownerName })}
                      {' · '}{t(`maps.stages.${map.stage}`)}
                      {map.areaM2 != null && ` · ${formatArea(map.areaM2)}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-loam-500">{t('teams.show.maps_hint')}</p>
        </>
      )}
      <p className="mt-2 text-xs text-loam-500">{t('teams.plan_note')}</p>
    </Card>
  )
}

function Leave({ team, me }: { team: TeamPageProps['team']; me: TeamMember }) {
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><LogOut className="h-4 w-4 text-loam-500" aria-hidden="true" />{t('teams.show.leave_title')}</h2>
      <p className="mt-2 text-sm text-loam-600">{me.lastAdmin ? t('teams.show.leave_last_admin') : t('teams.show.leave_body')}</p>
      <Button
        variant="secondary"
        className="mt-4"
        disabled={busy || me.lastAdmin}
        onClick={() => {
          if (!window.confirm(t('teams.show.leave_confirm', { name: team.name }))) return
          router.delete(`/teams/${team.id}/memberships/${me.id}`, { onStart: () => setBusy(true), onFinish: () => setBusy(false) })
        }}
      >
        {t('teams.show.leave')}
      </Button>
    </Card>
  )
}

function DeleteTeam({ team, base }: { team: TeamPageProps['team']; base: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Card className="border border-clay-100">
      <h2 className="flex items-center gap-2 text-base"><Trash2 className="h-4 w-4 text-clay-500" aria-hidden="true" />{t('teams.show.delete_title')}</h2>
      <p className="mt-2 text-sm text-loam-600">{t('teams.show.delete_body')}</p>
      <Button
        variant="secondary"
        className="mt-4 text-clay-700"
        disabled={busy}
        onClick={() => {
          if (!window.confirm(t('teams.show.delete_confirm', { name: team.name }))) return
          router.delete(base, { onStart: () => setBusy(true), onFinish: () => setBusy(false) })
        }}
      >
        {t('teams.show.delete')}
      </Button>
    </Card>
  )
}
