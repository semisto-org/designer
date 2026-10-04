// The « Dossier du projet » (GET /maps/:id/dossier.json). Mirrors MapDossier.
import type { MultiPolygon } from 'geojson'
import type { BBox, MapFeatureCollection, MapRole, MapStage } from '@/types'
import type { CurrentClimate, FinanceSummary, PlantsBlock, ProjectionsBlock, Unavailable, ClimateSource } from '@/types/climate_finance'
import type { RegulatoryAlert } from '@/types/drawing'
import type { ProjectData, ProjectSchema } from '@/types/journey'
import type { PlantingAlerts, PlantListData, PlantListRow } from '@/types/plants'
import type { Rainwater, TerrainStats } from '@/types/relief'
import type { Abundance, IndicatorTally, SoilIndicatorKey, SoilSampleData } from '@/types/soil_photos'

export const DOSSIER_SECTIONS = [
  'cover', 'project', 'terrain', 'climate', 'soil', 'design', 'plants', 'alerts', 'photos', 'finances', 'sources',
] as const
export type DossierSection = (typeof DOSSIER_SECTIONS)[number]

export type DossierPageProps = {
  map: { id: number; name: string; role: MapRole }
  canEdit: boolean
}

export type DossierRaster = {
  key: string
  name: string
  tileUrl: string
  tileSize: number
  minZoom: number | null
  maxZoom: number | null
  attribution: string | null
}

export type DossierRelief =
  | { locked: true }
  | {
      available: true
      stats: TerrainStats
      cellSizeM: number | null
      fetchedAt: string | null
      sources: Record<string, string>
      attribution: string | null
      rainwater: Rainwater
    }
  | { available: false; reason: 'not_imported' | 'running' | 'failed'; rainwater: Rainwater }

export type DesignKind = {
  kind: string
  count: number
  lengthM: number | null
  areaM2: number | null
  items: { id: number; name: string | null; lengthM: number | null; areaM2: number | null }[]
  more: number
}

export type DossierPhoto = {
  id: number
  caption: string | null
  takenAt: string
  dated: boolean
  width: number | null
  height: number | null
  thumbUrl: string
  largeUrl: string
}

export type DossierSource = {
  section: DossierSection
  key: string
  kind: 'layer' | 'layers' | 'relief' | 'climate' | 'plant_source' | 'regulation'
  label: string
  detail: string | null
  url: string | null
  license: string | null
}

export type SpreadSource = string // a catalogue source key, 'catalogue' or 'strata_default'

export type Dossier = {
  generatedOn: string
  map: {
    id: number
    name: string
    description: string | null
    address: string | null
    areaM2: number | null
    parcels: string[]
    stage: MapStage
    ownerName: string
    region: { key: string; name: string }
    updatedAt: string
  }
  viewer: { role: MapRole; canEdit: boolean }
  entitlements: { analyses: boolean; pdfExport: boolean }
  networks: { included: boolean; count: number }
  cover: {
    boundary: MultiPolygon | null
    bbox: BBox | null
    center: [number, number] | null
    features: MapFeatureCollection
    base: DossierRaster | null
    cadastre: DossierRaster | null
  }
  project: { values: ProjectData; percent: number; schema: ProjectSchema }
  terrain: {
    areaM2: number | null
    perimeterM: number | null
    parcels: string[]
    point: { lng: number; lat: number } | null
    identify: { zoom: number; layers: { key: string; name: string; group: string | null }[] } | null
    relief: DossierRelief
  }
  climate: {
    entitled: boolean
    current: CurrentClimate | Unavailable
    projections: ProjectionsBlock
    plants: PlantsBlock
    sources: ClimateSource[]
  }
  soil: {
    analyses: boolean
    samples: SoilSampleData[]
    fields: { key: string; unit: string | null }[]
    provenance: string
    bioindicators: {
      observations: { id: number; speciesName: string; latinName: string | null; abundance: Abundance; observedOn: string | null; indicators: SoilIndicatorKey[] }[]
      summary: IndicatorTally[]
    }
  }
  design: { layers: { layer: string; count: number; kinds: DesignKind[] }[] }
  plants: Omit<PlantListData, 'rows'> & { rows: (PlantListRow & { spreadSource: SpreadSource | null })[]; hardinessZone: number | null }
  alerts: {
    planting: PlantingAlerts
    regulatory: { alerts: RegulatoryAlert[]; rulesCount: number; boundary: boolean }
  }
  photos: { total: number; items: DossierPhoto[]; pairs: { beforeId: number; afterId: number; days: number }[]; defaults: number[] }
  finances: { exists: false } | { exists: true; updatedAt: string | null; summary: FinanceSummary['summary'] }
  sources: DossierSource[]
}

/** What the reader chose to print, remembered per map (localStorage). */
export type DossierPrefs = {
  sections: Record<DossierSection, boolean>
  photos: number[] | null
  cadastre: boolean
}
