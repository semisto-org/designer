// Super admin « Codes promo » (Admin::PromoCodesController, Billing::PromoCodeForm.row).

export type PromoCodeDuration = 'once' | 'repeating' | 'forever'

/** A Stripe promotion code, as listed on the screen. */
export type AdminPromoCode = {
  id: string
  code: string
  active: boolean
  timesRedeemed: number
  maxRedemptions: number | null
  expiresAt: string | null
  createdAt: string | null
  firstTimeOnly: boolean
  percentOff: number | null
  amountOffCents: number | null
  currency: string | null
  duration: PromoCodeDuration | null
  durationInMonths: number | null
  /** From the metadata written by this screen; null for a code made elsewhere. */
  planKeys: string[] | null
  note: string | null
  createdBy: string | null
  /** Payments recorded in the ledger with this code. */
  paymentsCount: number
}

/** A plan a code can apply to; `configured` when its Stripe price is set. */
export type AdminPromoPlan = { key: string; subscription: boolean; configured: boolean }
