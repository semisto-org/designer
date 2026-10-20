import { Head, Link, router, useForm } from '@inertiajs/react'
import clsx from 'clsx'
import { Info, RefreshCw, Ticket, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { formatNumber, t } from '@/lib/i18n'
import { formatDate, formatMoney } from '@/lib/money'
import type { AdminPromoCode, AdminPromoPlan, PromoCodeDuration } from '@/types/promoCodes'

type Props = {
  stripeEnabled: boolean
  plans: AdminPromoPlan[]
  suggestedCode: string
  defaultPlanKeys: string[]
  codes: AdminPromoCode[]
  hasMore: boolean
  nextAfter?: string | null
  after?: string | null
  listError: string | null
}

type FormData = {
  code: string
  discount_type: 'percent' | 'amount'
  percent_off: string
  amount_off: string
  duration: PromoCodeDuration
  duration_in_months: string
  plan_keys: string[]
  max_redemptions: string
  expires_on: string
  first_time_only: boolean
  note: string
}

const PATH = '/admin/promo-codes'
const DURATIONS: PromoCodeDuration[] = ['once', 'repeating', 'forever']
// No 0/O or 1/I: the code is read aloud and copied from e-mails (as on the server).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function suggestCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `BETA-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`
}

const planName = (key: string) => t(`billing.plans.${key}.name`)

/** Super admin « Codes promo »: make Stripe promotion codes and switch them off. */
export default function AdminPromoCodes(props: Props) {
  const { stripeEnabled, codes, listError } = props
  return (
    <div>
      <Head title={t('admin_promo_codes.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin_promo_codes.title')}</h1>
      <p className="mt-1 max-w-3xl text-loam-500">{t('admin_promo_codes.intro')}</p>
      {!stripeEnabled && (
        <p className="mt-4 flex max-w-3xl gap-2 rounded-lg bg-humus-50 p-3 text-sm text-humus-800 ring-1 ring-humus-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('admin_promo_codes.disabled')}
        </p>
      )}

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <PromoCodeForm {...props} />

        <section aria-labelledby="promo-codes-list">
          <h2 id="promo-codes-list" className="text-xl">{t('admin_promo_codes.list.title')}</h2>
          {listError && (
            <p className="mt-3 flex gap-2 rounded-lg bg-clay-50 p-3 text-sm text-clay-700 ring-1 ring-clay-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t('admin_promo_codes.list_error', { message: listError })}
            </p>
          )}
          {codes.length === 0 ? (
            !listError && stripeEnabled && <div className="mt-3"><EmptyState title={t('admin_promo_codes.list.empty')} /></div>
          ) : (
            <ul className="mt-3 space-y-3">
              {codes.map((code) => <li key={code.id}><PromoCodeCard code={code} /></li>)}
            </ul>
          )}
          {(props.hasMore || props.after) && (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {props.after && <Link href={PATH} className="text-prune-700 hover:underline">{t('admin_promo_codes.list.newest')}</Link>}
              {props.hasMore && props.nextAfter && (
                <Link href={PATH} data={{ after: props.nextAfter }} className="text-prune-700 hover:underline">{t('admin_promo_codes.list.older')}</Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function PromoCodeForm({ stripeEnabled, plans, suggestedCode, defaultPlanKeys }: Props) {
  const initial: FormData = {
    code: suggestedCode, discount_type: 'percent', percent_off: '100', amount_off: '', duration: 'once', duration_in_months: '3',
    plan_keys: defaultPlanKeys, max_redemptions: '', expires_on: '', first_time_only: false, note: '',
  }
  const form = useForm<FormData>(initial)
  const errors = form.errors as Partial<Record<keyof FormData | 'base', string>>
  const data = form.data
  const percent = data.discount_type === 'percent'
  const anySubscription = plans.some((plan) => plan.subscription && data.plan_keys.includes(plan.key))

  function submit(event: FormEvent) {
    event.preventDefault()
    form.transform((values) => ({
      promo_code: {
        ...values,
        code: values.code.trim().toUpperCase(),
        percent_off: percent ? values.percent_off : '',
        amount_off: percent ? '' : values.amount_off,
        duration_in_months: values.duration === 'repeating' ? values.duration_in_months : '',
        first_time_only: values.first_time_only ? '1' : '0',
      },
    }))
    form.post(PATH, {
      preserveScroll: true,
      preserveState: true,
      onSuccess: (page) => {
        const next = (page.props as unknown as Props).suggestedCode
        form.setDefaults({ ...initial, code: next })
        form.reset()
        form.setData('code', next)
      },
    })
  }

  function togglePlan(key: string, on: boolean) {
    form.setData('plan_keys', on ? [...data.plan_keys, key] : data.plan_keys.filter((k) => k !== key))
  }

  const discount = percent
    ? data.percent_off && `${formatNumber(Number(data.percent_off))} %`
    : data.amount_off && formatMoney(Math.round(Number(data.amount_off.replace(',', '.')) * 100))
  const summary = data.code && discount && data.plan_keys.length > 0
    ? t('admin_promo_codes.form.summary', { code: data.code.toUpperCase(), discount, plans: data.plan_keys.map(planName).join(', ') })
    : null

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-xl"><Ticket className="h-5 w-5 text-prune-600" aria-hidden />{t('admin_promo_codes.form.title')}</h2>
      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!stripeEnabled || form.processing} className="space-y-4 disabled:opacity-60">
          {errors.base && <p className="rounded-lg bg-clay-50 p-3 text-sm text-clay-700 ring-1 ring-clay-200">{errors.base}</p>}

          <Field label={t('admin_promo_codes.form.code')} hint={t('admin_promo_codes.form.code_hint')} error={errors.code}>
            <div className="flex gap-2">
              <Input
                required maxLength={40} value={data.code} autoComplete="off" spellCheck={false}
                pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,39}"
                onChange={(e) => form.setData('code', e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                className="font-mono tracking-wider uppercase"
              />
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => form.setData('code', suggestCode())} title={t('admin_promo_codes.form.another')}>
                <RefreshCw className="h-4 w-4" aria-hidden /><span className="sr-only sm:not-sr-only">{t('admin_promo_codes.form.another')}</span>
              </Button>
            </div>
          </Field>

          <div className="space-y-1">
            <span className="block text-sm font-medium text-loam-700">{t('admin_promo_codes.form.discount')}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('admin_promo_codes.form.discount')}>
              {(['percent', 'amount'] as const).map((kind) => (
                <button
                  key={kind} type="button" role="radio" aria-checked={data.discount_type === kind}
                  onClick={() => form.setData('discount_type', kind)}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    data.discount_type === kind ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50',
                  )}
                >
                  {t(`admin_promo_codes.form.${kind}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              {percent ? (
                <Input
                  type="number" min={1} max={100} step={1} required value={data.percent_off} aria-label={t('admin_promo_codes.form.percent')}
                  onChange={(e) => form.setData('percent_off', e.target.value)} className="w-28!"
                />
              ) : (
                <Input
                  type="number" min={0.01} step={0.01} required value={data.amount_off} aria-label={t('admin_promo_codes.form.amount')}
                  onChange={(e) => form.setData('amount_off', e.target.value)} className="w-28!"
                />
              )}
              <span className="text-sm text-loam-600">{t(`admin_promo_codes.form.${percent ? 'percent' : 'amount'}_suffix`)}</span>
            </div>
            {(errors.percent_off || errors.amount_off || errors.discount_type) && (
              <span className="block text-sm text-clay-600">{errors.percent_off || errors.amount_off || errors.discount_type}</span>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-loam-700">{t('admin_promo_codes.form.plans')}</legend>
            {plans.map((plan) => (
              <label key={plan.key} className={clsx('flex items-center gap-2 text-sm', !plan.configured && 'text-loam-400')}>
                <input
                  type="checkbox" disabled={!plan.configured} checked={data.plan_keys.includes(plan.key)}
                  onChange={(e) => togglePlan(plan.key, e.target.checked)}
                />
                <span className="text-loam-800">{planName(plan.key)}</span>
                <span className="text-xs text-loam-500">
                  {plan.configured
                    ? t(`admin_promo_codes.form.${plan.subscription ? 'plan_subscription' : 'plan_one_time'}`)
                    : t('admin_promo_codes.form.plan_not_configured')}
                </span>
              </label>
            ))}
            <span className={clsx('block text-sm', errors.plan_keys ? 'text-clay-600' : 'text-loam-500')}>
              {errors.plan_keys ?? t('admin_promo_codes.form.plans_hint')}
            </span>
          </fieldset>

          <div className={clsx('space-y-2 rounded-lg p-3 ring-1 ring-loam-200', !anySubscription && 'opacity-60')}>
            <Field label={t('admin_promo_codes.form.duration')} hint={t('admin_promo_codes.form.duration_hint')} error={errors.duration}>
              <div className="space-y-1.5 pt-1">
                {DURATIONS.map((duration) => (
                  <label key={duration} className="flex items-center gap-2 text-sm text-loam-800">
                    <input type="radio" name="duration" checked={data.duration === duration} onChange={() => form.setData('duration', duration)} />
                    {t(`admin_promo_codes.form.durations.${duration}`)}
                  </label>
                ))}
              </div>
            </Field>
            {data.duration === 'repeating' && (
              <Field label={t('admin_promo_codes.form.months')} error={errors.duration_in_months}>
                <Input
                  type="number" min={1} max={36} step={1} required value={data.duration_in_months}
                  onChange={(e) => form.setData('duration_in_months', e.target.value)} className="w-28!"
                />
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('admin_promo_codes.form.max_redemptions')} hint={t('admin_promo_codes.form.max_redemptions_hint')} error={errors.max_redemptions}>
              <Input type="number" min={1} step={1} value={data.max_redemptions} onChange={(e) => form.setData('max_redemptions', e.target.value)} />
            </Field>
            <Field label={t('admin_promo_codes.form.expires_on')} hint={t('admin_promo_codes.form.expires_on_hint')} error={errors.expires_on}>
              <Input type="date" min={new Date().toLocaleDateString('sv-SE')} value={data.expires_on} onChange={(e) => form.setData('expires_on', e.target.value)} />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5" checked={data.first_time_only} onChange={(e) => form.setData('first_time_only', e.target.checked)} />
            <span>
              <span className="block font-medium text-loam-800">{t('admin_promo_codes.form.first_time_only')}</span>
              <span className="block text-loam-500">{t('admin_promo_codes.form.first_time_only_hint')}</span>
            </span>
          </label>

          <Field label={t('admin_promo_codes.form.note')} hint={t('admin_promo_codes.form.note_hint')} error={errors.note}>
            <Textarea
              rows={2} maxLength={200} value={data.note} placeholder={t('admin_promo_codes.form.note_placeholder')}
              onChange={(e) => form.setData('note', e.target.value)}
            />
          </Field>

          {summary && <p className="font-hand text-lg leading-snug text-prune-700">{summary}</p>}
          <Button type="submit">{form.processing ? t('admin_promo_codes.form.working') : t('admin_promo_codes.form.submit')}</Button>
        </fieldset>
      </form>
    </Card>
  )
}

function Badge({ tone, children }: { tone: 'leaf' | 'loam' | 'humus'; children: ReactNode }) {
  const tones = { leaf: 'bg-leaf-100 text-leaf-700', loam: 'bg-loam-100 text-loam-600', humus: 'bg-humus-100 text-humus-700' }
  return <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', tones[tone])}>{children}</span>
}

function PromoCodeCard({ code }: { code: AdminPromoCode }) {
  const [busy, setBusy] = useState(false)
  const expired = Boolean(code.expiresAt && new Date(code.expiresAt).getTime() < Date.now())
  const discount = code.percentOff != null
    ? t('admin_promo_codes.list.percent_off', { value: formatNumber(code.percentOff) })
    : code.amountOffCents != null ? t('admin_promo_codes.list.amount_off', { value: formatMoney(code.amountOffCents, code.currency ?? 'EUR') }) : '—'
  const duration = code.duration && t(`admin_promo_codes.list.durations.${code.duration}`, { months: code.durationInMonths ?? 0 })
  const plans = code.planKeys ? code.planKeys.map(planName).join(', ') : t('admin_promo_codes.list.all_plans')
  const usage = code.maxRedemptions
    ? t('admin_promo_codes.list.redeemed_max', { count: code.timesRedeemed, max: code.maxRedemptions })
    : t('admin_promo_codes.list.redeemed', { count: code.timesRedeemed })

  function deactivate() {
    if (!window.confirm(t('admin_promo_codes.list.confirm_deactivate', { code: code.code }))) return
    setBusy(true)
    router.post(`${PATH}/${code.id}/deactivate`, {}, { preserveScroll: true, onFinish: () => setBusy(false) })
  }

  return (
    <Card className={clsx('p-4!', !code.active && 'bg-loam-50!')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={clsx('font-mono text-base font-semibold tracking-wider', code.active ? 'text-prune-800' : 'text-loam-500 line-through')}>{code.code}</span>
            {code.active
              ? expired ? <Badge tone="humus">{t('admin_promo_codes.list.expired')}</Badge> : <Badge tone="leaf">{t('admin_promo_codes.list.active')}</Badge>
              : <Badge tone="loam">{t('admin_promo_codes.list.inactive')}</Badge>}
          </p>
          <p className="mt-1 text-sm text-loam-800">
            <span className="font-medium">{discount}</span>{duration && ` ${duration}`} · {plans}
          </p>
        </div>
        {code.active && (
          <Button size="sm" variant="danger-ghost" disabled={busy} onClick={deactivate}>
            {t('admin_promo_codes.list.deactivate')}
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-loam-500">
        {[
          usage,
          t('admin_promo_codes.list.payments', { count: code.paymentsCount }),
          code.expiresAt ? t('admin_promo_codes.list.expires', { date: formatDate(code.expiresAt) }) : t('admin_promo_codes.list.no_expiry'),
          code.firstTimeOnly ? t('admin_promo_codes.list.first_time_only') : null,
        ].filter(Boolean).join(' · ')}
      </p>
      {code.note && <p className="mt-2 font-hand text-lg leading-snug text-loam-700">{code.note}</p>}
      {(code.createdAt || code.createdBy) && (
        <p className="mt-1 text-xs text-loam-400">
          {[code.createdAt && t('admin_promo_codes.list.created', { date: formatDate(code.createdAt) }), code.createdBy && t('admin_promo_codes.list.created_by', { email: code.createdBy })]
            .filter(Boolean).join(' ')}
        </p>
      )}
    </Card>
  )
}
