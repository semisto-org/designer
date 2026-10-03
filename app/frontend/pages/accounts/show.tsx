import { Head, Link, router, useForm } from '@inertiajs/react'
import { CreditCard, Sparkles, Trash2 } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { AccountData } from '@/types/billing'

export default function AccountShow({ account }: { account: AccountData }) {
  const form = useForm({ name: account.name ?? '' })
  const maps = account.maxMaps < 1000
    ? t('account.maps', { used: account.ownedMaps, max: account.maxMaps })
    : t('account.maps_unlimited', { used: account.ownedMaps })
  const planName = account.subscriptionPlan ? t(`account.plan_names.${account.subscriptionPlan}`) : t(`account.plan_names.${account.plan}`)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t('account.title')} />
      <h1 className="text-2xl">{t('account.title')}</h1>

      <Card>
        <h2 className="text-base">{t('account.profile')}</h2>
        <div className="mt-4 flex items-center gap-4">
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="h-14 w-14 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-full bg-prune-100 text-xl font-semibold text-prune-700" aria-hidden="true">
              {(account.name ?? account.email).slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 text-sm text-loam-500">
            <p className="truncate font-medium text-loam-900">{account.name ?? account.email}</p>
            <p>{t('account.member_since', { date: formatDate(account.signedUpAt) })}</p>
            {account.googleLinked && <p>{t('account.google')}</p>}
          </div>
        </div>
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

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-leaf-500" aria-hidden="true" />{t('account.plan')}</h2>
            <p className="mt-3 text-lg font-semibold text-loam-900">{planName}</p>
            <p className="mt-1 text-sm text-loam-500">
              {account.passExpiresAt && account.plan === 'yearly' ? `${t('account.plan_until', { date: formatDate(account.passExpiresAt) })} · ` : ''}
              {maps}
            </p>
          </div>
          <ButtonLink href="/billing" variant="secondary">{t('account.manage_plan')}</ButtonLink>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl flex-1">
            <h2 className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-prune-500" aria-hidden="true" />{t('account.ai_title')}</h2>
            <p className="mt-2 text-sm text-loam-600">{t('account.ai_body')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HelpButton slug="connecter-claude" />
            <Link href="/account/ai" className="inline-flex items-center justify-center rounded-lg bg-prune-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-prune-700">
              {t('account.ai_link')}
            </Link>
          </div>
        </div>
      </Card>

      <div className="sm:hidden">
        <Link href="/session" method="delete" as="button" className="w-full rounded-lg bg-white px-3.5 py-2.5 text-sm font-medium text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
          {t('nav.sign_out')}
        </Link>
      </div>

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
