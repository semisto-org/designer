import { Link, router, usePage } from '@inertiajs/react'
import { useState, type ReactNode } from 'react'
import { buttonClass, Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { CatalogKey } from '@/types/billing'
import type { SharedProps } from '@/types'

type Props = {
  plan: CatalogKey
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'leaf'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Sends the visitor to Stripe Checkout (the session is created server side).
 * Signed out: goes through sign-in and lands on /billing with the plan
 * highlighted. Billing not configured (beta): /billing explains it.
 */
export function CheckoutButton({ plan, children, variant = 'primary', size = 'md', className }: Props) {
  const { currentUser, env } = usePage().props as unknown as SharedProps
  const [busy, setBusy] = useState(false)

  if (!currentUser || !env.billing) {
    return (
      <Link href={`/billing?plan=${plan}`} className={buttonClass(variant, size, className)}>
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
        router.post('/billing/checkout', { plan }, { onFinish: () => setBusy(false) })
      }}
    >
      {busy ? t('billing.actions.redirecting') : children}
    </Button>
  )
}
