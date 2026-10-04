import { router } from '@inertiajs/react'
import { Check, Copy, LogOut, Mail, RefreshCw, Trash2, UserMinus, Users } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { SharingData, SharingMember } from '@/types/collab'
import { MapTeamSection } from '@/teams/MapTeamSection'
import { Avatar } from './Avatar'
import { Dialog } from './Dialog'

/**
 * Who has access to the map and how: members with their roles, invitations
 * by e-mail, the role-bound link. The owner manages everything; other members
 * see who is on the map and can leave it.
 */
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const base = `/maps/${editor.map.id}`
  const [data, setData] = useState<SharingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<SharingData>(`${base}/sharing`).then(setData).catch(() => setError(t('collab.share.load_error')))
  }, [base])

  // Runs a request that answers with the refreshed dialog data.
  const run = useCallback(async (request: () => Promise<SharingData>, success?: string) => {
    setBusy(true)
    setError(null)
    try {
      setData(await request())
      if (success) editor.notify(success)
      return true
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : t('collab.share.error'))
      return false
    } finally {
      setBusy(false)
    }
  }, [editor])

  const owner = data?.role === 'owner'

  return (
    <Dialog title={t('collab.share.title')} onClose={onClose}>
      {!data ? (
        <p className="text-sm text-loam-500">{error ?? t('common.loading')}</p>
      ) : (
        <div className="space-y-6">
          {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{error}</p>}
          <Members data={data} owner={owner} busy={busy} base={base} run={run} onLeft={() => router.visit('/maps')} />
          {owner && <Invite data={data} busy={busy} base={base} run={run} />}
          {owner && <ShareLink data={data} busy={busy} base={base} run={run} />}
          {owner && <MapTeamSection data={data} busy={busy} base={base} run={run} />}
        </div>
      )}
    </Dialog>
  )
}

type Run = (request: () => Promise<SharingData>, success?: string) => Promise<boolean>
type SectionProps = { data: SharingData; busy: boolean; base: string; run: Run }

function Members({ data, owner, busy, base, run, onLeft }: SectionProps & { owner: boolean; onLeft: () => void }) {
  const editor = useEditor()
  const [leaving, setLeaving] = useState(false)

  async function leave() {
    if (!window.confirm(t('collab.share.leave_confirm'))) return
    const membership = data.members.find((m) => m.you)
    if (!membership) return
    setLeaving(true)
    try {
      await api(`${base}/memberships/${membership.id}`, { method: 'DELETE' })
      onLeft()
    } catch (e) {
      editor.notify((e as Error).message, 'error')
      setLeaving(false)
    }
  }

  const seats = t('collab.share.editors_count', { count: data.editorsCount, max: data.maxEditors })

  return (
    <section aria-labelledby="share-members">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="share-members" className="flex items-center gap-1.5 text-sm font-semibold text-loam-900"><Users className="h-4 w-4 text-loam-500" />{t('collab.share.members')}</h3>
        <span className="text-xs text-loam-500">{seats}</span>
      </div>
      <ul className="mt-2 divide-y divide-loam-100">
        {data.members.map((member) => (
          <MemberRow key={member.id} member={member} owner={owner} busy={busy} base={base} run={run} data={data} />
        ))}
      </ul>
      {data.organization && (
        <p className="mt-2 rounded-lg bg-lichen-50 px-3 py-2 text-xs text-lichen-700">
          {t('collab.share.team', { name: data.organization.name, count: data.organization.members })}
        </p>
      )}
      {/* People who reach the map only through its team leave the team, not the map. */}
      {!owner && data.members.some((m) => m.you) && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" onClick={() => void leave()} disabled={leaving}>
            <LogOut className="h-4 w-4" />
            {t('collab.share.leave')}
          </Button>
        </div>
      )}
    </section>
  )
}

function MemberRow({ member, owner, busy, base, run, data }: SectionProps & { member: SharingMember; owner: boolean }) {
  const canManage = owner && member.role !== 'owner'
  const editorsFull = data.editorsCount >= data.maxEditors
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={member.name} url={member.avatarUrl} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-loam-900">
          {member.name}
          {member.you && <span className="ml-1.5 text-xs font-normal text-loam-400">{t('collab.share.you')}</span>}
        </p>
        {member.email && <p className="truncate text-xs text-loam-500">{member.email}</p>}
      </div>
      {canManage ? (
        <>
          <Select
            aria-label={t('collab.share.role_of', { name: member.name })}
            value={member.role}
            disabled={busy}
            className="py-1.5" style={{ width: 'auto' }}
            onChange={(e) => void run(() => api<SharingData>(`${base}/memberships/${member.id}`, { method: 'PATCH', body: { membership: { role: e.target.value } } }))}
          >
            <option value="viewer">{t('maps.roles.viewer')}</option>
            <option value="editor" disabled={editorsFull && member.role !== 'editor'}>
              {t('maps.roles.editor')}{editorsFull && member.role !== 'editor' ? ` ${t('collab.share.full')}` : ''}
            </option>
          </Select>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('collab.share.remove_confirm', { name: member.name }))) {
                void run(() => api<SharingData>(`${base}/memberships/${member.id}`, { method: 'DELETE' }))
              }
            }}
            className="rounded-md p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-500"
            aria-label={t('collab.share.remove', { name: member.name })}
            title={t('collab.share.remove', { name: member.name })}
          >
            <UserMinus className="h-4 w-4" />
          </button>
        </>
      ) : (
        <span className="rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600">{t(`maps.roles.${member.role}`)}</span>
      )}
    </li>
  )
}

function Invite({ data, busy, base, run }: SectionProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const invitations = data.invitations ?? []
  const seatsTaken = data.editorsCount + invitations.filter((i) => i.role === 'editor').length
  const editorsFull = seatsTaken >= data.maxEditors

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(
      () => api<SharingData>(`${base}/invitations`, { method: 'POST', body: { invitation: { email_address: email, role } } }),
      t('collab.share.invited', { email: email.trim().toLowerCase() }),
    )
    if (ok) setEmail('')
  }

  return (
    <section aria-labelledby="share-invite" className="space-y-3">
      <h3 id="share-invite" className="flex items-center gap-1.5 text-sm font-semibold text-loam-900"><Mail className="h-4 w-4 text-loam-500" />{t('collab.share.invite_title')}</h3>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('collab.share.invite_placeholder')}
          aria-label={t('collab.share.invite_email')}
          className="min-w-0 flex-1 basis-48"
        />
        <Select aria-label={t('collab.share.invite_role')} value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')} style={{ width: 'auto' }}>
          <option value="viewer">{t('maps.roles.viewer')}</option>
          <option value="editor" disabled={editorsFull}>{t('maps.roles.editor')}{editorsFull ? ` ${t('collab.share.full')}` : ''}</option>
        </Select>
        <Button type="submit" disabled={busy || email.trim() === ''}>{t('collab.share.invite_send')}</Button>
      </form>
      <p className="text-xs text-loam-500">{t(`collab.share.role_help_${role}`)}</p>
      {editorsFull && <p className="text-xs text-humus-700">{t('collab.share.editors_full', { max: data.maxEditors })}</p>}

      {invitations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('collab.share.pending')}</h4>
          <ul className="mt-1 divide-y divide-loam-100">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{invitation.email}</span>
                <span className="rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600">{t(`maps.roles.${invitation.role}`)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api<SharingData>(`${base}/invitations/${invitation.id}/resend`, { method: 'POST' }), t('collab.share.resent', { email: invitation.email }))}
                  className="rounded-md p-1.5 text-loam-500 hover:bg-loam-100"
                  aria-label={t('collab.share.resend', { email: invitation.email })}
                  title={t('collab.share.resend', { email: invitation.email })}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api<SharingData>(`${base}/invitations/${invitation.id}`, { method: 'DELETE' }))}
                  className="rounded-md p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-500"
                  aria-label={t('collab.share.cancel_invitation', { email: invitation.email })}
                  title={t('collab.share.cancel_invitation', { email: invitation.email })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function ShareLink({ data, busy, base, run }: SectionProps) {
  const link = data.link ?? { enabled: false, role: 'viewer' as const, url: null }
  const [copied, setCopied] = useState(false)
  const invitations = data.invitations ?? []
  const editorsFull = data.editorsCount + invitations.filter((i) => i.role === 'editor').length >= data.maxEditors

  async function copy() {
    if (!link.url) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      document.querySelector<HTMLInputElement>('#share-link-url')?.select()
    }
  }

  return (
    <section aria-labelledby="share-link" className="space-y-3 border-t border-loam-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="share-link" className="text-sm font-semibold text-loam-900">{t('collab.share.link_title')}</h3>
          <p className="text-xs text-loam-500">{t('collab.share.link_hint')}</p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={link.enabled}
            disabled={busy}
            aria-label={t('collab.share.link_title')}
            onChange={(e) => void run(() => api<SharingData>(`${base}/share_link`, e.target.checked ? { method: 'POST', body: { share_link: { role: link.role } } } : { method: 'DELETE' }))}
          />
          <span className="h-6 w-11 rounded-full bg-loam-200 transition peer-checked:bg-leaf-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-prune-600" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </label>
      </div>
      {link.enabled && link.url && (
        <>
          <div className="flex gap-2">
            <Input id="share-link-url" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label={t('collab.share.link_title')} className="min-w-0 flex-1 text-xs" />
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4 text-leaf-600" /> : <Copy className="h-4 w-4" />}
              {copied ? t('collab.share.copied') : t('collab.share.copy')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-loam-600">
              {t('collab.share.link_role')}
              <Select
                value={link.role}
                disabled={busy}
                className="py-1.5" style={{ width: 'auto' }}
                onChange={(e) => void run(() => api<SharingData>(`${base}/share_link`, { method: 'PATCH', body: { share_link: { role: e.target.value } } }))}
              >
                <option value="viewer">{t('maps.roles.viewer')}</option>
                <option value="editor" disabled={editorsFull && link.role !== 'editor'}>{t('maps.roles.editor')}</option>
              </Select>
            </label>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('collab.share.reset_confirm'))) void run(() => api<SharingData>(`${base}/share_link/reset`, { method: 'POST' }), t('collab.share.reset_done'))
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {t('collab.share.reset')}
            </Button>
          </div>
          <p className="text-xs text-loam-500">{t(`collab.share.role_help_${link.role}`)} {t('collab.share.link_role_hint')}</p>
        </>
      )}
    </section>
  )
}
