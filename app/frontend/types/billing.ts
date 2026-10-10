// Types for billing, the account page, the help center and public site meta.
export type PlanKey = 'free' | 'yearly' | 'atelier' | 'bureau'
export type CatalogKey = PlanKey | 'drone'

export type CatalogPlan = {
  key: CatalogKey
  kind: 'free' | 'one_time' | 'subscription'
  priceCents: number
  interval: 'year' | 'month' | null
  maxMaps: number | null
  purchasable: boolean
}

export type PassData = {
  planKey: 'yearly'
  startsAt: string
  expiresAt: string
  daysLeft: number
}

export type SubscriptionData = {
  planKey: 'atelier' | 'bureau'
  status: string
  active: boolean
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  pastDue: boolean
}

export type PaymentData = {
  id: number
  planKey: CatalogKey
  paidAt: string
  amountCents: number
  currency: string
  refundedCents: number
  invoiceUrl: string | null
}

/** A plan paid on invoice (or granted by Semisto) for a period. */
export type GrantData = {
  id: number
  planKey: InvoicePlanKey
  startsAt: string
  endsAt: string
  active: boolean
  revokedAt: string | null
  onInvoice: boolean
  daysLeft: number
}

export type InvoicePlanKey = 'atelier' | 'bureau' | 'yearly'
export type InvoiceRequestStatus = 'requested' | 'invoiced' | 'paid' | 'cancelled'

/** « Payer sur facture »: a request as its author sees it. */
export type InvoiceRequestSummary = {
  id: number
  planKey: InvoicePlanKey
  organizationName: string
  purchaseOrder: string | null
  status: InvoiceRequestStatus
  amountCents: number
  currency: string
  createdAt: string
  invoiceUrl: string | null
  invoiceNumber: string | null
}

export type BillingData = {
  enabled: boolean
  plan: PlanKey
  pass: PassData | null
  expiredPass: PassData | null
  subscription: SubscriptionData | null
  ownedMaps: number
  maxMaps: number
  readOnlyMaps: number
  drone: { paidAt: string }[]
  canManage: boolean
  payments: PaymentData[]
  grants: GrantData[]
  invoiceRequests: InvoiceRequestSummary[]
  catalog: CatalogPlan[]
  memberPriceCents: number
  checkout: 'success' | 'cancelled' | null
  highlight: CatalogKey | null
}

export type AccountData = {
  name: string | null
  email: string
  avatarUrl: string | null
  signedUpAt: string
  googleLinked: boolean
  /** Has chosen an (optional) password. */
  hasPassword: boolean
  plan: PlanKey
  /** When the plan stops unless renewed (pass or plan paid on invoice); null for a subscription or the free map. */
  planEndsAt: string | null
  ownedMaps: number
  maxMaps: number
  readOnlyMaps: number
}

export type HelpArticleSummary = {
  slug: string
  title: string
  summary: string
  category: string
  url: string
  excerpt?: string
}

export type HelpArticleFull = HelpArticleSummary & {
  html: string
  headings: { id: string; text: string }[]
}

export type HelpCategory = { name: string; articles: HelpArticleSummary[] }

/** Server-rendered <head> tag (Inertia Rails meta), re-rendered on the client by MetaHead. */
export type MetaTag = {
  tagName: string
  headKey: string
  type?: string
  innerContent?: unknown
  [attribute: string]: unknown
}
