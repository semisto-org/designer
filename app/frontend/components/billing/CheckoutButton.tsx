import { Link, router, usePage } from '@inertiajs/react'
import { useState, type ReactNode } from 'react'
import { buttonClass, Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { BillingInterval, CatalogKey } from '@/types/billing'
import type { SharedProps } from '@/types'

type Props = {
  plan: CatalogKey
  /** Pro and Team: billed monthly or yearly. */
  interval?: BillingInterval
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'leaf'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Where to come back after paying (a locked panel, a read-only map). */
  returnTo?: string | null
}

/**
 * Sends the visitor to Stripe Checkout (the session is created server side).
 * Signed out: goes through sign-in and lands on /billing with the plan
 * highlighted. Billing not configured (beta): /billing explains it.
 */
export function CheckoutButton({ plan, interval, children, variant = 'primary', size = 'md', className, returnTo }: Props) {
  const { currentUser, env } = usePage().props as unknown as SharedProps
  const [busy, setBusy] = useState(false)

  if (!currentUser || !env.billing) {
    return (
      <Link href={`/billing?plan=${plan}${interval ? `&interval=${interval}` : ''}${returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ''}`} className={buttonClass(variant, size, className)}>
        {children}
      </Link>
    )
  }
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true)
        router.post('/billing/checkout', { plan, ...(interval && { interval }), ...(returnTo && { return_to: returnTo }) }, { onFinish: () => setBusy(false) })
      }}
    >
      {busy ? t('billing.actions.redirecting') : children}
    </Button>
  )
}
