import type { MultiPolygon } from 'geojson'
import type { LngLat, RegionData, RegionLayerData } from '@/types'

export type AnswerField = { key: string; type: 'enum' | 'multi'; values: string[]; exclusive?: string[] }
export type AnswersSchema = { fields: AnswerField[] }
export type Answers = Record<string, string | string[]>

export type PublicRequestFormProps = {
  slug: string
  account: string
  intro: string | null
  region: RegionData
  layers: RegionLayerData[]
  schema: AnswersSchema
  maxPhotos: number
  maxParcels: number
}

export type RequestStatus = 'new' | 'called' | 'visited' | 'offer_sent' | 'accepted' | 'declined'

export type RequestFormData = { id: number; slug: string; active: boolean; intro: string | null; url: string }

export type RequestSummary = {
  id: number
  formId: number
  name: string
  address: string | null
  status: RequestStatus
  createdAt: string
  areaM2: number | null
  parcels: number
  mapId: number | null
  profile: string | null
}

export type RequestAccount = {
  key: string
  name: string | null
  canEdit: boolean
  form: RequestFormData | null
  requests: RequestSummary[]
}

export type RequestDetail = {
  id: number
  formId: number
  name: string
  email: string
  phone: string | null
  address: string | null
  message: string | null
  answers: Answers
  status: RequestStatus
  teamNotes: string | null
  createdAt: string
  statusChangedAt: string | null
  areaM2: number | null
  parcels: { capakey: string; label?: string | null; lng: number; lat: number }[]
  center: LngLat | null
  boundary: MultiPolygon | null
  mapId: number | null
  mapName: string | null
  photos: { id: number; url: string; name: string }[]
}
