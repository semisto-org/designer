/** « Vues drone »: dated aerial views on a map, set up by Semisto or imported from a file. */
export type AerialViewKind = 'xyz' | 'pmtiles'

/** A view as the map editor receives it (prop `aerialViews` of maps/show, newest first). */
export type AerialView = {
  id: number
  name: string
  /** ISO date of the flight ("2027-05-12"). */
  capturedOn: string
  kind: AerialViewKind
  /** What the raster shows (AerialView::PRODUCTS): one-band rasters are coloured on import. */
  product: 'orthophoto' | 'elevation' | 'thermal' | 'multispectral'
  /** An XYZ template ({z}/{x}/{y}) or one .pmtiles archive (for an imported view, a path of the app). */
  url: string
  attribution: string | null
  minZoom: number | null
  maxZoom: number | null
}

export type AerialImportStatus = 'uploading' | 'processing' | 'ready' | 'failed'

/** A view someone imported from a file on the map (prop `aerialImports`, editors only). */
export type AerialImport = Omit<AerialView, 'url'> & {
  url: string | null
  status: AerialImportStatus
  /** Why it could not be prepared (drone.import.failures.*). */
  failure: string | null
  bounds: { west: number; south: number; east: number; north: number } | null
  filename: string
  byteSize: number
  createdBy: string | null
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
  /** For a view imported from a file or copied into Terranova. */
  status?: AerialImportStatus
  failure?: string | null
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
