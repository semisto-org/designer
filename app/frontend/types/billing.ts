// Types for billing, the account page, the help center and public site meta.
import type { SketchGeometry } from '@/types/myMaps'
export type PlanKey = 'free' | 'yearly' | 'atelier' | 'bureau'
export type CatalogKey = PlanKey | 'drone'

export type CatalogPlan = {
  key: CatalogKey
  kind: 'free' | 'one_time' | 'subscription'
  priceCents: number
  interval: 'year' | 'month' | null
  maxMaps: number | null
  purchasable: boolean
  /** Pro and Team: the yearly price (two months free), else null. */
  yearlyPriceCents: number | null
  /** The first year's yearly price while the launch offer runs, else null. */
  launchPriceCents: number | null
  yearlyPurchasable: boolean
  storageGb: number | null
  renderingsPerMonth: number | null
}

export type BillingInterval = 'month' | 'year'

export type StorageUsageData = {
  usedBytes: number
  limitBytes: number | null
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

/** A place (active map) a plan covers, for « Formule et facturation ». */
export type BilledPlace = {
  id: number
  name: string
  areaM2: number | null
  /** Beyond the plan's active maps: readable, not editable. */
  readOnly: boolean
  boundary: SketchGeometry | null
}

/** What the plan does for the payer's places. */
export type PlacesData = {
  maps: BilledPlace[]
  activeCount: number
  archivedCount: number
  renderings: { used: number; limit: number }
  /** The map that would stay editable on the free plan; null for a team payer. */
  keptOnFree: { id: number; name: string } | null
  freeMaxMaps: number
  freeStorageBytes: number
}

export type BillingData = {
  enabled: boolean
  plan: PlanKey
  pass: PassData | null
  expiredPass: PassData | null
  subscription: SubscriptionData | null
  ownedMaps: number
  /** Teams whose maps this plan also pays for (« Forfait de l'équipe »). */
  paidTeams: { id: number; name: string }[]
  /** Once the user pays for a team, their own maps follow the free plan apart. */
  personalMaps: { used: number; max: number; readOnly: number; storage: StorageUsageData } | null
  maxMaps: number
  readOnlyMaps: number
  drone: { paidAt: string }[]
  canManage: boolean
  payments: PaymentData[]
  grants: GrantData[]
  invoiceRequests: InvoiceRequestSummary[]
  catalog: CatalogPlan[]
  memberPriceCents: number
  /** Semisto membership fee up to date: Home is discounted automatically at checkout. */
  member: boolean
  storage: StorageUsageData
  places: PlacesData
  /** Where the person came from (a locked panel, a read-only map), to go back after paying. */
  returnTo: string | null
  checkout: 'success' | 'cancelled' | null
  highlight: CatalogKey | null
  interval: BillingInterval
}

export type AccountKind = 'individual' | 'professional'

export type AccountData = {
  name: string | null
  email: string
  avatarUrl: string | null
  hasOwnAvatar: boolean
  signedUpAt: string
  googleLinked: boolean
  appleLinked: boolean
  /** Has chosen an (optional) password. */
  hasPassword: boolean
  /** Who the person designs for (welcome page); null until chosen. */
  accountKind: AccountKind | null
  /** VAT (BCE) number printed on invoices, as BE0123456789. */
  vatNumber: string | null
  /** The logo printed at the top of my maps' documents (pro accounts). */
  logoUrl: string | null
  plan: PlanKey
  /** When the plan stops unless renewed (pass or plan paid on invoice); null for a subscription or the free map. */
  planEndsAt: string | null
  ownedMaps: number
  maxMaps: number
  readOnlyMaps: number
  /** Own maps on the free plan, apart from the teams the user pays for; null otherwise. */
  personalMaps: { used: number; max: number } | null
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
  /** The other guides of its category (the drawer lists them). */
  related?: HelpArticleSummary[]
}

/** `stage`: the step of the journey the category follows (Observer…), else null. */
export type HelpCategory = { name: string; stage?: string | null; articles: HelpArticleSummary[] }

/** Server-rendered <head> tag (Inertia Rails meta), re-rendered on the client by MetaHead. */
export type MetaTag = {
  tagName: string
  headKey: string
  type?: string
  innerContent?: unknown
  [attribute: string]: unknown
}
