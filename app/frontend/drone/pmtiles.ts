import { addProtocol } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

let registered = false

/**
 * Lets MapLibre read `pmtiles://https://…/file.pmtiles`: one archive on a
 * plain web host, fetched tile by tile with HTTP range requests (the host
 * must allow GET/HEAD with the Range header from our origin). Registered
 * once for the whole page, whatever the number of maps.
 */
export function ensurePmtilesProtocol() {
  if (registered) return
  addProtocol('pmtiles', new Protocol().tile)
  registered = true
}
