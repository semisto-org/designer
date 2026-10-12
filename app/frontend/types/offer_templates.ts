// Pricing templates (OfferTemplate): their summary for the list, and the
// whole pricing (Offer::Pricing) for the editor. Data keeps the server's
// snake_case keys: it goes back as it is.
import type { ComplexityCriterion, ComplexityLevel, OfferSettings, OfferTerms, Phase, PlantCategory, PlantingType } from '@/types/offers'

export type TemplateSummary = { id: number; name: string; clientTypes: string[]; updatedAt: string | null }

export type PricingTask = {
  key: string
  phase: Phase
  label: string | null
  persons: number | 'designers'
  base: number
  per: number
  driver: string | null
  when: string | null
  option: boolean
  gain_pct: number
}

export type PricingExpense = { key: string; phase: Phase; label: string | null; amount: number; when: string | null; option: boolean }

export type PricingData = {
  settings: OfferSettings
  tasks: PricingTask[]
  expenses: PricingExpense[]
  categories: PlantCategory[]
  supplies: Record<string, number>
  small_material: number
  planting_types: PlantingType[]
  default_trips: Record<Phase, number>
  complexity: { criteria: ComplexityCriterion[]; levels: ComplexityLevel[] }
  target_design_share_pct: number
  terms: OfferTerms
}

export type TemplateAccount = { key: string; name: string | null; canEdit: boolean; templates: TemplateSummary[] }

export type TemplateEditProps = {
  template: TemplateSummary & { data: PricingData }
  account: { key: string; name: string | null }
  vocabulary: {
    phases: Phase[]
    drivers: string[]
    conditions: string[]
    clientTypes: string[]
    supplies: string[]
    settings: Record<string, { min: number; max: number }>
  }
}
