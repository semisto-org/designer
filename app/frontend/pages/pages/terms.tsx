import { LegalPage } from '@/components/site/LegalPage'
import { formatPrice } from '@/lib/money'
import type { CatalogPlan } from '@/types/billing'

export default function Terms({ contactEmail, catalog }: { contactEmail: string; catalog: CatalogPlan[] }) {
  const price = (key: string) => formatPrice(catalog.find((plan) => plan.key === key)?.priceCents ?? 0)
  return (
    <LegalPage
      namespace="terms"
      vars={{ email: contactEmail, yearly: price('yearly'), atelier: price('atelier'), bureau: price('bureau'), drone: price('drone') }}
    />
  )
}
