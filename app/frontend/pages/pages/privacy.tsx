import { LegalPage } from '@/components/site/LegalPage'

export default function Privacy({ contactEmail }: { contactEmail: string }) {
  return <LegalPage namespace="privacy" vars={{ email: contactEmail }} />
}
