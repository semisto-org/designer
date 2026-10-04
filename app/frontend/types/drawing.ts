import type { FeatureLayer } from '@/types'

// Element library (config/map_elements.yml), as the frontend uses it.
export type ElementGeometry = 'Point' | 'LineString' | 'Polygon' | 'MultiLineString'
export type ElementFieldType = 'number' | 'integer' | 'select' | 'boolean' | 'text'

export type ElementField = {
  key: string
  type: ElementFieldType
  unit?: string
  min?: number
  max?: number
  step?: number
  options?: string[]
  readonly?: boolean
}

export type ElementLineStyle = { width?: number; dash?: number[]; opacity?: number; casing?: string }
export type ElementFillStyle = { opacity?: number; pattern?: 'hatch' | 'dots' }

export type ElementSpec = {
  kind: string
  layer: FeatureLayer
  geometries: ElementGeometry[]
  icon: string
  color: string
  line?: ElementLineStyle
  fill?: ElementFillStyle
  /** Property holding a crown diameter in meters (drawn at true size). */
  crown?: string
  defaults: Record<string, unknown>
  fields: ElementField[]
  computed: string[]
  pickable: boolean
}

export type ElementLayer = { layer: FeatureLayer; color: string; elements: ElementSpec[] }

// Regulatory alerts (GET /maps/:id/alerts).
export type RegulatoryAlert = {
  rule: string
  check: string
  severity: 'info' | 'warning'
  featureIds: number[]
  kind: string
  title: string
  explanation: string
  source: { label?: string; url?: string } | null
}

export type AlertsResponse = { alerts: RegulatoryAlert[]; rulesCount: number; boundary: boolean }

// Real-time messages of MapFeaturesChannel.
export type FeatureBroadcast =
  | { action: 'upsert'; id: number; actorId: number | null; feature: import('@/types').MapFeature }
  | { action: 'remove'; id: number; actorId: number | null; feature: null }
