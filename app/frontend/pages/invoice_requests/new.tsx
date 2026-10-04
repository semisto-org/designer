import { Head, Link, useForm } from '@inertiajs/react'
import { ArrowLeft, Landmark } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { content, tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { formatPrice } from '@/lib/money'
import type { InvoicePlanKey } from '@/types/billing'
import type { InvoicePlan } from '@/types/invoicing'

type Props = {
  plans: InvoicePlan[]
  defaults: { planKey: InvoicePlanKey; billingEmail: string }
}

/** « Payer sur facture »: a commune, a school or a company asks for an invoice payable by transfer. */
export default function NewInvoiceRequest({ plans, defaults }: Props) {
  const form = useForm({
    organization_name: '',
    billing_address: '',
    company_number: '',
    billing_email: defaults.billingEmail,
    purchase_order: '',
    plan_key: defaults.planKey,
    message: '',
  })
  const plan = plans.find((p) => p.key === form.data.plan_key) ?? plans[0]
  const steps = content<string[]>('invoicing.new.next_steps')

  return (
    <div className="mx-auto max-w-5xl">
      <Head title={t('invoicing.new.title')} />
      <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('invoicing.new.back')}
      </Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl"><Landmark className="h-6 w-6 text-leaf-600" aria-hidden="true" />{t('invoicing.new.title')}</h1>
          <p className="mt-1 max-w-2xl text-loam-500">{tf('invoicing.new.intro')}</p>
        </div>
        <HelpButton slug="payer-sur-facture" className="shrink-0" />
      </div>

      <form
        className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
        onSubmit={(event) => {
          event.preventDefault()
          form.transform((data) => ({ invoice_request: data }))
          form.post('/billing/invoice', { preserveScroll: true })
        }}
      >
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-base">{t('invoicing.new.who_title')}</h2>
            <Field label={t('invoicing.new.organization_name')} error={form.errors.organization_name}>
              <Input
                value={form.data.organization_name}
                onChange={(e) => form.setData('organization_name', e.target.value)}
                placeholder={t('invoicing.new.organization_name_placeholder')}
                autoComplete="organization" maxLength={200} required
              />
            </Field>
            <Field label={t('invoicing.new.billing_address')} hint={tf('invoicing.new.billing_address_hint')} error={form.errors.billing_address}>
              <Textarea
                rows={4}
                value={form.data.billing_address}
                onChange={(e) => form.setData('billing_address', e.target.value)}
                placeholder={t('invoicing.new.billing_address_placeholder')}
                autoComplete="street-address" maxLength={1000} required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('invoicing.new.company_number')} hint={tf('invoicing.new.company_number_hint')} error={form.errors.company_number}>
                <Input value={form.data.company_number} onChange={(e) => form.setData('company_number', e.target.value)} maxLength={40} />
              </Field>
              <Field label={t('invoicing.new.purchase_order')} hint={tf('invoicing.new.purchase_order_hint')} error={form.errors.purchase_order}>
                <Input value={form.data.purchase_order} onChange={(e) => form.setData('purchase_order', e.target.value)} maxLength={100} />
              </Field>
            </div>
            <Field label={t('invoicing.new.billing_email')} hint={tf('invoicing.new.billing_email_hint')} error={form.errors.billing_email}>
              <Input type="email" value={form.data.billing_email} onChange={(e) => form.setData('billing_email', e.target.value)} autoComplete="email" maxLength={254} required />
            </Field>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-base">{t('invoicing.new.plan_title')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('invoicing.new.plan')} error={form.errors.plan_key}>
                <Select value={form.data.plan_key} onChange={(e) => form.setData('plan_key', e.target.value as InvoicePlanKey)}>
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {tf('invoicing.new.plan_option', { plan: t(`billing.plans.${p.key}.name`), amount: formatPrice(p.amountCents) })}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('invoicing.new.duration')}>
                <p className="py-2 text-sm text-loam-800">{t('invoicing.new.duration_value')}</p>
              </Field>
            </div>
            <Field label={t('invoicing.new.message')} hint={tf('invoicing.new.message_hint')} error={form.errors.message}>
              <Textarea rows={3} value={form.data.message} onChange={(e) => form.setData('message', e.target.value)} maxLength={3000} />
            </Field>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="bg-leaf-50/60">
            <p className="text-sm font-medium text-loam-600">{t('invoicing.new.amount')}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-loam-900">{formatPrice(plan.amountCents)}</p>
            <p className="mt-1 text-sm text-loam-600">{t(`billing.plans.${plan.key}.name`)} · {t('invoicing.durations.year')}</p>
            <p className="mt-2 text-sm text-loam-500">
              {plan.monthlyCents
                ? tf('invoicing.new.amount_monthly', { monthly: formatPrice(plan.monthlyCents) })
                : tf('invoicing.new.amount_yearly')}
            </p>
            <Button type="submit" className="mt-5 w-full" disabled={form.processing}>
              {form.processing ? t('invoicing.new.sending') : t('invoicing.new.submit')}
            </Button>
          </Card>
          <div className="px-1">
            <h2 className="text-sm font-semibold text-loam-800">{t('invoicing.new.next_title')}</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-loam-600">
              {steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        </aside>
      </form>
    </div>
  )
}
