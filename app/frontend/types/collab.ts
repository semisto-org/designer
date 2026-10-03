import type { FeatureCollection, Geometry, MultiPolygon } from 'geojson'
import type { BBox, LngLat, MapFeatureProperties } from '@/types'

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
}

export type SharingInvitation = {
  id: number
  email: string
  role: 'editor' | 'viewer'
  expiresAt: string | null
  sentAt: string | null
}

export type SharingData = {
  role: 'owner' | 'editor' | 'viewer'
  maxEditors: number
  editorsCount: number
  members: SharingMember[]
  organization: { name: string; members: number } | null
  invitations?: SharingInvitation[]
  link?: { enabled: boolean; role: 'editor' | 'viewer'; url: string | null }
}

export type PublicationOptions = {
  feature_layers: string[]
  region_layers: string[]
  hide_networks: boolean
  hide_address: boolean
  show_notes: boolean
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
}

export type PublicationData = {
  publication: PublicationState | null
  defaults: { title: string; options: PublicationOptions }
  featureLayers: { key: string; count: number }[]
  regionLayers: { key: string; name: string; category: 'base' | 'overlay'; group: string | null; sensitive: boolean }[]
}

/** A region layer as the public view receives it: tiles come from our own proxy. */
export type PublicLayer = {
  key: string
  name: string
  group: string | null
  category: 'base' | 'overlay'
  attribution: string | null
  opacity: number
  legendUrl: string | null
  minZoom: number | null
  maxZoom: number | null
  tiles: string
}

export type PublicMapProps = {
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
  }
  features: FeatureCollection<Geometry, MapFeatureProperties>
  layers: PublicLayer[]
}
