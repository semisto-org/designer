import type { FeatureCollection, Geometry, MultiPolygon } from 'geojson'
import type { BBox, LayerLegendData, LngLat, MapFeatureProperties } from '@/types'
import type { AerialView } from '@/types/drone'
import type { PublicGrowth } from '@/public_maps/garden'

/** What a discussion can hang on (server whitelist: Commentable::TYPES). */
export type ThreadType = 'Map' | 'MapFeature'

export type Mention = { id: number; handle: string }

export type CommentData = {
  id: number
  body: string
  author: { id: number; name: string; avatarUrl: string | null }
  createdAt: string
  editedAt: string | null
  mentions: Mention[]
  applause: { count: number; mine: boolean; names: string[] }
  canEdit: boolean
  canDelete: boolean
}

/** A person who can be @mentioned. */
export type Mentionable = { id: number; name: string; handle: string; avatarUrl: string | null }

export type ThreadData = {
  commentable: { type: ThreadType; id: number; key: string; title: string }
  comments: CommentData[]
  subscribed: boolean
  lastReadAt: string | null
  members: Mentionable[]
  commentEmails: boolean
}

export type ThreadSummary = {
  type: ThreadType
  id: number
  key: string
  title: string
  layer: string | null
  kind: string | null
  count: number
  lastCommentAt: string | null
  lastAuthorName: string | null
  preview: string | null
  unread: boolean
  subscribed: boolean
}

export type SharingMember = {
  id: number
  userId: number
  name: string
  avatarUrl: string | null
  email?: string | null
  role: 'owner' | 'editor' | 'viewer'
  you: boolean
  /** Owns the land the map draws (« Propriétaire du lieu »). */
  placeOwner: boolean
}

export type SharingInvitation = {
  id: number
  email: string
  role: 'editor' | 'viewer'
  expiresAt: string | null
  sentAt: string | null
  placeOwner: boolean
}

export type SharingData = {
  role: 'owner' | 'editor' | 'viewer'
  editorsCount: number
  members: SharingMember[]
  organization: { id: number; name: string; members: number } | null
  invitations?: SharingInvitation[]
  link?: { enabled: boolean; role: 'editor' | 'viewer'; url: string | null }
  /** Owner only: their teams, where the map can be moved (teams area). */
  teams?: { id: number; name: string }[]
  /** The place's owners and the choices only they make. */
  place: SharingPlace
}

export type SharingPlace = {
  owners: string[]
  you: boolean
  sharesPlantedPalette: boolean
  acceptsPropagationRequests: boolean
  /** Place owners only: requests waiting for an answer. */
  pendingRequests: number | null
}

export type PublicationOptions = {
  feature_layers: string[]
  region_layers: string[]
  hide_networks: boolean
  hide_address: boolean
  show_notes: boolean
  /** Names of zones and paths; off by default (they often carry private notes). */
  show_zone_names?: boolean
  /** The newest drone view (drone area); off by default. */
  show_aerial_view?: boolean
}

export type PublicationState = {
  title: string
  description: string | null
  version: number
  publishedAt: string
  token: string
  path: string
  url: string
  live: boolean
  stale: boolean
  options: PublicationOptions
  /** The link preview painted for this snapshot (collab/preview.ts), when there is one. */
  previewPath?: string | null
  /** Visits of the public view (one per browser session, robots and the map's people left out). */
  views?: number
  /** Accounts this view brought (users.source_publication_id). */
  gardensStarted?: number
}

export type PublicationData = {
  publication: PublicationState | null
  defaults: { title: string; options: PublicationOptions }
  featureLayers: { key: string; count: number }[]
  regionLayers: { key: string; name: string; category: 'base' | 'overlay'; group: string | null; sensitive: boolean }[]
  /** The drone view a publication would show (drone area), null without one. */
  aerialView?: Pick<AerialView, 'name' | 'capturedOn'> | null
  /** After publishing: what the public view shows, to paint the link preview from. */
  publicProps?: PublicMapProps
}

/** A region layer as the public view receives it: tiles come from our own proxy. */
export type PublicLayer = {
  key: string
  name: string
  group: string | null
  category: 'base' | 'overlay'
  attribution: string | null
  opacity: number
  legend?: LayerLegendData | null
  legendUrl: string | null
  minZoom: number | null
  maxZoom: number | null
  tiles: string
}

export type PublicMapProps = {
  token: string
  title: string
  description: string | null
  version: number
  publishedAt: string
  map: {
    areaM2: number | null
    stage: string
    boundary: MultiPolygon | null
    center: LngLat | null
    zoom: number | null
    bbox: BBox | null
    address?: string | null
    parcels?: string[] | null
    regionName: string | null
    /** The town of the address, only when the owner shows it. */
    locality?: string | null
  }
  /** How the published plants grow, for the years bar (absent from older snapshots). */
  growth?: PublicGrowth | null
  features: FeatureCollection<Geometry, MapFeatureProperties>
  layers: PublicLayer[]
  /** The drone view the owner chose to show (drone area): tiles straight from Semisto's host. */
  aerialView?: AerialView | null
  /** The simplified 3D view (/p/:token/3d), when the terrain's relief is there. */
  reliefPath?: string | null
}
