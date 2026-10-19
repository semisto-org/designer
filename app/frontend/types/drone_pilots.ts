/** The drone pilot directory and its missions (DronePilots::Directory, DroneMissionsController). */

export type DroneDataType = 'photos' | 'video' | 'panorama' | 'orthophoto' | 'elevation' | 'thermal' | 'multispectral' | 'point_cloud' | 'model_3d'
export type DroneFeature = 'rtk' | 'thermal' | 'multispectral' | 'lidar'

export type DroneQuote = {
  priceCents: number
  travelKm: number
  travelCents: number
  commissionCents: number
  totalCents: number
  pilotShareCents: number
}

/** A pilot as the directory shows them (never their legal details). */
export type PilotCard = {
  id: number
  name: string
  avatarUrl: string | null
  bio: string | null
  basePlace: string
  radiusKm: number
  drones: { model: string; name: string | null }[]
  features: DroneFeature[]
  dataTypes: DroneDataType[]
  certificates: string[]
  priceCents: number
  travelFeesEnabled: boolean
  missionsDone: number
  /** For the chosen map: straight-line distance, whether they fly there, the full price. */
  distanceKm: number | null
  serves: boolean | null
  quote: DroneQuote | null
}

export type BookableMap = { id: number; name: string; address: string | null }

export type MissionStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'paid' | 'delivered' | 'completed' | 'refunded'

export type MissionRow = {
  id: number
  status: MissionStatus
  mapName: string
  pilotName: string
  clientName: string
  totalCents: number
  flightOn: string | null
  createdAt: string
  disputed: boolean
}

export type MissionDetail = {
  id: number
  status: MissionStatus
  role: 'pilot' | 'client'
  map: { id: number; name: string; address: string | null }
  pilot: PilotCard & { phone: string | null; email: string | null }
  client: { name: string; avatarUrl: string | null; email: string | null }
  dataTypes: DroneDataType[]
  desiredPeriod: string | null
  message: string
  pilotReply: string | null
  flightOn: string | null
  deliveryNote: string | null
  disputed: boolean
  disputeMessage: string | null
  quote: DroneQuote
  createdAt: string
  acceptedAt: string | null
  paidAt: string | null
  deliveredAt: string | null
  paidOutAt: string | null
  confirmBy: string | null
  canDeliver: boolean
  paymentOpen: boolean
  delivered: {
    views: { id: number; name: string; capturedOn: string; status: string; failure: string | null }[]
    photosCount: number
    files: { id: number; filename: string; byteSize: number; url: string }[]
  }
}
