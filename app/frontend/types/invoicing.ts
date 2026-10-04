// « Payer sur facture »: the request form, its confirmation and the staff screen.
import type { GrantData, InvoicePlanKey, InvoiceRequestSummary } from '@/types/billing'

/** A plan that can be paid on invoice, with the amount of one year. */
export type InvoicePlan = {
  key: InvoicePlanKey
  amountCents: number
  monthlyCents: number | null
}

export type InvoiceRequestDetails = InvoiceRequestSummary & {
  billingAddress: string
  billingEmail: string
  companyNumber: string | null
  message: string | null
}

export type AdminInvoiceRequest = InvoiceRequestDetails & {
  euVat: boolean
  durationMonths: number
  stripeInvoiceId: string | null
  invoicePdfUrl: string | null
  stripeAddress: string
  invoicedAt: string | null
  paidAt: string | null
  cancelledAt: string | null
  user: { id: number; name: string; email: string }
  handledBy: string | null
  grant: GrantData | null
  suggestedStart: string | null
}
