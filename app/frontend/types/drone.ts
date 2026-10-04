/** « Vues drone »: dated aerial views Semisto sets up on a map. */
export type AerialViewKind = 'xyz' | 'pmtiles'

/** A view as the map editor receives it (prop `aerialViews` of maps/show, newest first). */
export type AerialView = {
  id: number
  name: string
  /** ISO date of the flight ("2027-05-12"). */
  capturedOn: string
  kind: AerialViewKind
  /** https only: an XYZ template ({z}/{x}/{y}) or one .pmtiles archive. */
  url: string
  attribution: string | null
  minZoom: number | null
  maxZoom: number | null
}

/** Staff screen: a view with where it lives and who added it. */
export type AdminAerialView = AerialView & {
  host: string | null
  mapId: number
  mapName: string
  ownerName: string
  planPurchaseId: number | null
  createdAt: string
  createdBy: string | null
}

export type AdminDroneOrder = {
  id: number
  paidAt: string
  amountCents: number | null
  currency: string | null
  user: { id: number; name: string; email: string }
  /** The buyer's active maps, oldest first. */
  maps: { id: number; name: string; areaM2: number | null; address: string | null }[]
  views: AdminAerialView[]
}

export type DroneOrderFilter = 'todo' | 'done' | 'all'
