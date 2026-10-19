import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import regular0 from './glyphs/noto-sans-regular-0-255.pbf'
import regular256 from './glyphs/noto-sans-regular-256-511.pbf'
import regular8192 from './glyphs/noto-sans-regular-8192-8447.pbf'
import bold0 from './glyphs/noto-sans-bold-0-255.pbf'
import bold256 from './glyphs/noto-sans-bold-256-511.pbf'
import bold8192 from './glyphs/noto-sans-bold-8192-8447.pbf'

/**
 * A page opened from a folder (file://) cannot fetch the files beside it:
 * MapLibre reads the aerial tiles and the label glyphs through two
 * protocols that answer from memory instead.
 *
 * - `offline://<layer>/{z}/{x}/{y}`: the tiles the export packed, as base64
 *   in donnees/tuiles-*.js (window.TERRANOVA_TILES);
 * - `glyphs://<fontstack>/<range>`: Noto Sans, the font of the map labels,
 *   for Latin, Latin Extended and punctuation (« », ’), built into the viewer.
 */
const GLYPHS: Record<string, Record<string, string>> = {
  'Noto Sans Regular': { '0-255': regular0, '256-511': regular256, '8192-8447': regular8192 },
  'Noto Sans Bold': { '0-255': bold0, '256-511': bold256, '8192-8447': bold8192 },
}

type Tiles = Record<string, Record<string, string>>

/** A transparent 1×1 PNG, for the tiles beyond the packed area. */
const EMPTY_TILE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='

function decode(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function tileStore(): Tiles {
  return ((window as unknown as { TERRANOVA_TILES?: Tiles }).TERRANOVA_TILES ?? {})
}

export function installOfflineProtocols() {
  maplibregl.addProtocol('offline', async (params) => {
    const [, layer, z, x, y] = params.url.match(/^offline:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/) ?? []
    const tile = layer ? tileStore()[decodeURIComponent(layer)]?.[`${z}/${x}/${y}`] : undefined
    // Outside the packed area, the neutral background shows through.
    return { data: decode(tile ?? EMPTY_TILE) }
  })
  maplibregl.addProtocol('glyphs', async (params) => {
    const [, stack, range] = params.url.match(/^glyphs:\/\/([^/]+)\/([\d-]+)/) ?? []
    const font = stack ? decodeURIComponent(stack).split(',')[0].trim() : ''
    const url = (GLYPHS[font] ?? GLYPHS['Noto Sans Regular'])[range ?? '']
    // A range the viewer does not carry draws nothing rather than failing.
    if (!url) return { data: new ArrayBuffer(0) }
    return { data: await (await fetch(url)).arrayBuffer() }
  })
}

/** The base style of the offline plan: paper, no remote tiles, local glyphs. */
export const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'glyphs://{fontstack}/{range}',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ede9e3' } }],
}
