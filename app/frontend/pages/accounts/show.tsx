import { Head, Link, router, useForm, usePage } from '@inertiajs/react'
import { type ReactNode, useRef, useState } from 'react'
import { Briefcase, Camera, CreditCard, KeyRound, LogOut, Sprout, Sparkles, Trash2 } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { LogoCard } from '@/components/LogoCard'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { TeamsCard } from '@/teams/TeamsCard'
import type { AccountData, AccountKind } from '@/types/billing'

export default function AccountShow({ account }: { account: AccountData }) {
  const form = useForm({ name: account.name ?? '' })
  const maps = account.maxMaps < 1000
    ? t('account.maps', { used: account.ownedMaps, max: account.maxMaps })
    : t('account.maps_unlimited', { used: account.ownedMaps })
  const planName = t(`account.plan_names.${account.plan}`)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t('account.title')} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">{t('account.title')}</h1>
        <ButtonLink href="/session" method="delete" variant="secondary" size="sm">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t('nav.sign_out')}
        </ButtonLink>
      </div>

      <Card>
        <h2 className="text-base">{t('account.profile')}</h2>
        <AvatarPicker account={account}>
          <p className="truncate font-medium text-loam-900">{account.name ?? account.email}</p>
          <p>{t('account.member_since', { date: formatDate(account.signedUpAt) })}</p>
          {account.googleLinked && <p>{t('account.google')}</p>}
          {account.appleLinked && <p>{t('account.apple')}</p>}
        </AvatarPicker>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            form.transform((data) => ({ user: { name: data.name } }))
            form.patch('/account', { preserveScroll: true })
          }}
          className="mt-6 space-y-4"
        >
          <Field label={t('account.name')} hint={t('account.name_hint')} error={form.errors.name}>
            <Input value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} autoComplete="name" maxLength={120} />
          </Field>
          <Field label={t('account.email')} hint={t('account.email_hint')}>
            <Input value={account.email} readOnly disabled />
          </Field>
          <Button type="submit" disabled={form.processing || !form.isDirty}>{t('account.save')}</Button>
        </form>
      </Card>

      <AccountKindCard kind={account.accountKind} />

      {account.accountKind === 'professional' && (
        <LogoCard logoUrl={account.logoUrl} endpoint="/account/logo" param="user" intro={t('logos.account_intro')} />
      )}

      <PasswordCard hasPassword={account.hasPassword} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-leaf-500" aria-hidden="true" />{t('account.plan')}</h2>
            <p className="mt-3 text-lg font-semibold text-loam-900">{planName}</p>
            <p className="mt-1 text-sm text-loam-500">
              {account.planEndsAt ? `${t('account.plan_until', { date: formatDate(account.planEndsAt) })} · ` : ''}
              {maps}
            </p>
          </div>
          <ButtonLink href="/billing" variant="secondary">{t('account.manage_plan')}</ButtonLink>
        </div>
      </Card>

      <TeamsCard />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl flex-1">
            <h2 className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-prune-500" aria-hidden="true" />{t('account.ai_title')}</h2>
            <p className="mt-2 text-sm text-loam-600">{t('account.ai_body')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HelpButton slug="connecter-son-ia" />
            <Link href="/account/ai" className="inline-flex items-center justify-center rounded-lg bg-prune-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-prune-700">
              {t('account.ai_link')}
            </Link>
          </div>
        </div>
      </Card>

      <Card className="border border-clay-100">
        <h2 className="flex items-center gap-2 text-base"><Trash2 className="h-4 w-4 text-clay-500" aria-hidden="true" />{t('account.danger_title')}</h2>
        <p className="mt-2 text-sm text-loam-600">{t('account.danger_body')}</p>
        <Button
          variant="secondary"
          className="mt-4 text-clay-700"
          onClick={() => {
            if (window.confirm(t('account.delete_confirm'))) router.post('/account/deletion_request', {}, { preserveScroll: true })
          }}
        >
          {t('account.delete_request')}
        </Button>
      </Card>
    </div>
  )
}

// The picture shown next to my name everywhere: tap it (or the button) to
// choose one; HEIC from an iPhone is converted on the server.
function AvatarPicker({ account, children }: { account: AccountData; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const error = (usePage().props.errors as unknown as Record<string, string> | undefined)?.avatar
  const upload = (file: File) => {
    setBusy(true)
    router.post('/account/avatar', { _method: 'patch', user: { avatar: file } }, {
      forceFormData: true, preserveScroll: true, onFinish: () => setBusy(false),
    })
  }

  return (
    <div className="mt-4 flex items-start gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600"
        aria-label={account.avatarUrl ? t('account.avatar.change') : t('account.avatar.choose')}
      >
        {account.avatarUrl ? (
          <img src={account.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-prune-100 text-xl font-semibold text-prune-700" aria-hidden="true">
            {(account.name ?? account.email).slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-white text-prune-700 shadow ring-1 ring-loam-200 group-hover:bg-prune-50" aria-hidden="true">
          <Camera className="h-4 w-4" />
        </span>
      </button>
      <div className="min-w-0 flex-1 text-sm text-loam-500">
        {children}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? t('account.avatar.uploading') : account.avatarUrl ? t('account.avatar.change') : t('account.avatar.choose')}
          </Button>
          {account.hasOwnAvatar && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => router.delete('/account/avatar', { preserveScroll: true })}>
              {t('account.avatar.remove')}
            </Button>
          )}
        </div>
        <p className={error ? 'mt-1.5 text-clay-700' : 'mt-1.5'}>{error ?? t('account.avatar.hint')}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) upload(file)
        }}
      />
    </div>
  )
}

// Own place or clients: what the welcome page asked, changeable here.
function AccountKindCard({ kind }: { kind: AccountKind | null }) {
  const other: AccountKind = kind === 'professional' ? 'individual' : 'professional'
  const Icon = kind === 'professional' ? Briefcase : Sprout

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-leaf-500" aria-hidden="true" />{t('account.kind.title')}</h2>
          <p className="mt-3 text-lg font-semibold text-loam-900">{kind ? t(`account.kind.${kind}`) : t('account.kind.none')}</p>
          {kind && <p className="mt-1 text-sm text-loam-500">{t(`account.kind.${kind}_hint`)}</p>}
        </div>
        <Button
          variant="secondary"
          onClick={() => router.patch('/account', { user: { account_kind: other } }, { preserveScroll: true })}
        >
          {t(`account.kind.change_to_${other}`)}
        </Button>
      </div>
    </Card>
  )
}

// The optional password: chosen freely the first time, the current one is
// asked to change or remove it.
function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const form = useForm({ current_password: '', password: '', password_confirmation: '' })
  const submit = (method: 'patch' | 'delete') => {
    form.transform((data) => ({ user: data }))
    form.submit(method, '/account/password', { preserveScroll: true, onSuccess: () => form.reset() })
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-prune-500" aria-hidden="true" />{t('account.password.title')}</h2>
      <p className="mt-2 text-sm text-loam-600">{hasPassword ? t('account.password.set') : t('account.password.none')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit('patch')
        }}
        className="mt-4 max-w-sm space-y-4"
      >
        {/* For password managers: the account this password belongs to. */}
        <input type="hidden" autoComplete="username" />
        {hasPassword && (
          <Field label={t('account.password.current')} error={form.errors.current_password}>
            <Input type="password" autoComplete="current-password" required value={form.data.current_password} onChange={(event) => form.setData('current_password', event.target.value)} />
          </Field>
        )}
        <Field label={t('account.password.new')} hint={t('account.password.new_hint')} error={form.errors.password}>
          <Input type="password" autoComplete="new-password" required minLength={10} maxLength={72} value={form.data.password} onChange={(event) => form.setData('password', event.target.value)} />
        </Field>
        <Field label={t('account.password.confirmation')} error={form.errors.password_confirmation}>
          <Input type="password" autoComplete="new-password" required value={form.data.password_confirmation} onChange={(event) => form.setData('password_confirmation', event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.processing}>{hasPassword ? t('account.password.change') : t('account.password.choose')}</Button>
          {hasPassword && (
            <Button
              variant="secondary"
              disabled={form.processing || !form.data.current_password}
              onClick={() => {
                if (window.confirm(t('account.password.remove_confirm'))) submit('delete')
              }}
            >
              {t('account.password.remove')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
