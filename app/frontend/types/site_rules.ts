// JSON of GET /maps/:id/site_rules (SiteRules::MapReport).

export type SiteRulesReason = 'not_configured' | 'no_location' | 'unavailable'
export type Unavailable = { available: false; reason: SiteRulesReason }

export type RiskItem = {
  key: string
  group: 'natural' | 'technological'
  present: boolean
  label: string
  level: string | null
  scope: 'address' | 'commune'
  advice: string | null
}

export type RisksBlock =
  | Unavailable
  | {
      available: true
      scope: 'address' | 'commune'
      address: string | null
      commune: { name: string | null; insee: string | null }
      reportUrl: string
      items: RiskItem[]
    }

export type UrbanismDocument = { type: string | null; title: string | null; date: string | null; url: string | null }
export type UrbanismZone = {
  label: string
  longLabel: string | null
  type: string | null
  family: 'u' | 'au' | 'a' | 'n' | 'other'
  date: string | null
  url: string | null
  advice: string
}
export type UrbanismSector = {
  label: string
  type: string | null
  family: 'constructible' | 'activities' | 'not_constructible' | 'other'
  date: string | null
  url: string | null
  advice: string
}
export type UrbanismPrescription = { type: string | null; label: string | null; kinds: string[]; count: number; advice: string | null }
export type UrbanismEasement = {
  category: string | null
  kind: string | null
  names: string[]
  count: number
  network: boolean
  url: string | null
  label: string
  advice: string
}

export type UrbanismBlock =
  | Unavailable
  | {
      available: true
      partial: boolean
      communes: { name: string; insee: string; rnu: boolean }[]
      rnu: boolean
      documentMissing: boolean
      documents: UrbanismDocument[]
      zones: UrbanismZone[]
      sectors: UrbanismSector[]
      prescriptions: UrbanismPrescription[]
      easements: UrbanismEasement[]
    }

export type SiteRulesSource = { key: string; publisher: string; title: string; licence: string; url: string }

export type SiteRulesReport = {
  region: { key: string; name: string } | null
  configured: boolean
  location: { lng: number; lat: number } | null
  queriedWith: 'outline' | 'center' | null
  risks: RisksBlock
  urbanism: UrbanismBlock
  layers: { key: string; name: string }[]
  sources: SiteRulesSource[]
}
