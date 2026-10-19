import { router } from '@inertiajs/react'
import { Gift } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { AdminUserRow, PlanKey } from '@/types/admin'

const GIFT_PLANS: Exclude<PlanKey, 'free'>[] = ['yearly', 'atelier', 'bureau']
const today = () => new Date().toISOString().slice(0, 10)

function PlanSelect({ value, onChange }: { value: string; onChange: (plan: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('admin.plan_gifts.plan')}>
      {GIFT_PLANS.map((plan) => <option key={plan} value={plan}>{t(`billing.plans.${plan}.name`)}</option>)}
    </Select>
  )
}

/** « Offrir une formule » to one account, or the running gift and « Reprendre ». */
export function PlanGift({ user }: { user: AdminUserRow }) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<string>('yearly')
  const [endsOn, setEndsOn] = useState('')

  if (user.gift) {
    const revoke = () => {
      if (!window.confirm(t('admin.plan_gifts.confirm_revoke', { name: user.name }))) return
      router.post(`/admin/plan-gifts/${user.gift!.id}/revoke`, {}, { preserveScroll: true })
    }
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-sm text-leaf-800">
        <Gift className="h-4 w-4" aria-hidden />
        {t('admin.plan_gifts.gifted_until', { date: formatDate(user.gift.endsAt) })}
        <button type="button" onClick={revoke} className="text-prune-700 hover:underline">{t('admin.plan_gifts.revoke')}</button>
      </span>
    )
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title={t('admin.plan_gifts.give')} aria-label={t('admin.plan_gifts.give')}>
        <Gift className="h-4 w-4" aria-hidden />
      </Button>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    router.post(`/admin/users/${user.id}/plan-gifts`, { plan_key: plan, ends_on: endsOn }, { preserveScroll: true, onSuccess: () => setOpen(false) })
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
      <PlanSelect value={plan} onChange={setPlan} />
      <Input type="date" required min={today()} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} aria-label={t('admin.plan_gifts.until')} className="w-40!" />
      <Button size="sm" type="submit">{t('admin.plan_gifts.submit')}</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('admin.plan_gifts.cancel')}</Button>
    </form>
  )
}

/** The same gift to every account created before a date that is on the free plan. */
export function PlanGiftAll() {
  const [plan, setPlan] = useState<string>('yearly')
  const [endsOn, setEndsOn] = useState('')
  const [before, setBefore] = useState(today())

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const message = t('admin.plan_gifts.bulk.confirm', {
      plan: t(`billing.plans.${plan}.name`), date: formatDate(endsOn), before: formatDate(before),
    })
    if (!window.confirm(message)) return
    router.post('/admin/plan-gifts', { plan_key: plan, ends_on: endsOn, created_before: before }, { preserveScroll: true })
  }

  return (
    <Card className="mt-6">
      <h2 className="flex items-center gap-2 text-lg"><Gift className="h-5 w-5 text-leaf-700" aria-hidden />{t('admin.plan_gifts.bulk.title')}</h2>
      <p className="mt-1 text-sm text-loam-500">{t('admin.plan_gifts.bulk.body')}</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field label={t('admin.plan_gifts.plan')}><PlanSelect value={plan} onChange={setPlan} /></Field>
        <Field label={t('admin.plan_gifts.until')}>
          <Input type="date" required min={today()} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>
        <Field label={t('admin.plan_gifts.bulk.created_before')}>
          <Input type="date" required value={before} onChange={(e) => setBefore(e.target.value)} />
        </Field>
        <Button type="submit">{t('admin.plan_gifts.bulk.submit')}</Button>
      </form>
    </Card>
  )
}
