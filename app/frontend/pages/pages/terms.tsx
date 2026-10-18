import { LegalPage } from '@/components/site/LegalPage'
import { formatPrice } from '@/lib/money'
import type { CatalogPlan } from '@/types/billing'

export default function Terms({ contactEmail, catalog, memberPriceCents }: { contactEmail: string; catalog: CatalogPlan[]; memberPriceCents: number }) {
  const plan = (key: string) => catalog.find((p) => p.key === key)
  const price = (key: string) => formatPrice(plan(key)?.priceCents ?? 0)
  const yearly = (key: string) => formatPrice(plan(key)?.yearlyPriceCents ?? 0)
  const launch = (key: string) => formatPrice(plan(key)?.launchPriceCents ?? plan(key)?.yearlyPriceCents ?? 0)
  return (
    <LegalPage
      namespace="terms"
      vars={{
        email: contactEmail, yearly: price('yearly'), atelier: price('atelier'), bureau: price('bureau'), drone: price('drone'),
        atelier_yearly: yearly('atelier'), bureau_yearly: yearly('bureau'), atelier_launch: launch('atelier'), bureau_launch: launch('bureau'),
        member: formatPrice(memberPriceCents),
      }}
    />
  )
}
