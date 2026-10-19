/**
 * Ghost rendering of a thematic sheet (« Carnet de planches »): the layer the
 * sheet is about keeps its colours, everything else drawn on the map turns a
 * faded grey, and the aerial photo or base map loses its colours, the way a
 * permaculture design's water, access or structure map is drawn over a pale
 * site plan.
 *
 * Colours and opacities are rewritten as expressions: `['case', isTheme,
 * original, ghost]`. MapLibre only accepts `['zoom']` as the input of a
 * top-level `step` or `interpolate`, so a zoom curve keeps its stops and has
 * each output wrapped instead; anything else that reads the zoom is left as
 * it is.
 */

export const GHOST_COLOR = '#b9b0a3'
export const GHOST_OPACITY = 0.45

type Kind = 'color' | 'opacity'
/** `true`: the whole layer is the theme; `false`: all of it is ghosted; else an expression saying which features are. */
export type ThemeTest = boolean | unknown[]

const PAINT: Record<string, [string, Kind][]> = {
  fill: [['fill-color', 'color'], ['fill-outline-color', 'color'], ['fill-opacity', 'opacity']],
  line: [['line-color', 'color'], ['line-opacity', 'opacity']],
  circle: [['circle-color', 'color'], ['circle-stroke-color', 'color'], ['circle-opacity', 'opacity'], ['circle-stroke-opacity', 'opacity']],
  symbol: [['text-color', 'color'], ['icon-color', 'color'], ['text-opacity', 'opacity'], ['icon-opacity', 'opacity']],
  'fill-extrusion': [['fill-extrusion-color', 'color']],
}

const DEFAULTS: Record<Kind, unknown> = { color: '#000000', opacity: 1 }

const readsZoom = (value: unknown): boolean =>
  Array.isArray(value) && (value[0] === 'zoom' || value.some(readsZoom))

const isZoomCurve = (value: unknown): value is unknown[] =>
  Array.isArray(value) && (value[0] === 'interpolate' || value[0] === 'step') &&
  Array.isArray(value[value[0] === 'interpolate' ? 2 : 1]) && (value[value[0] === 'interpolate' ? 2 : 1] as unknown[])[0] === 'zoom'

function ghostOf(value: unknown, kind: Kind): unknown {
  return kind === 'color' ? GHOST_COLOR : ['*', value, GHOST_OPACITY]
}

/** One output of a paint property, ghosted where the test says so; null when it cannot be rewritten. */
function wrap(value: unknown, kind: Kind, test: ThemeTest): unknown | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) return null // legacy function
  if (readsZoom(value)) return null
  const original = value ?? DEFAULTS[kind]
  if (test === true) return original
  if (test === false) return kind === 'color' ? GHOST_COLOR : typeof original === 'number' ? original * GHOST_OPACITY : ghostOf(original, kind)
  return ['case', test, original, ghostOf(original, kind)]
}

/** The ghosted value of a paint property, or null to leave it alone. */
export function ghostValue(value: unknown, kind: Kind, test: ThemeTest): unknown | null {
  if (test === true) return null
  if (isZoomCurve(value)) {
    const head = value[0] === 'interpolate' ? 3 : 2
    const curve = [...value]
    // step: [step, input, default, stop, out, …]; interpolate: [interpolate, type, input, stop, out, …]
    const outputs = value[0] === 'step' ? [head, ...range(head + 2, value.length, 2)] : range(head + 1, value.length, 2)
    for (const i of outputs) {
      const out = wrap(value[i], kind, test)
      if (out == null) return null
      curve[i] = out
    }
    return curve
  }
  return wrap(value, kind, test)
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let i = from; i < to; i += step) out.push(i)
  return out
}

/** The paint properties to set on a style layer so that what is not the theme turns to ghost. */
export function ghostPaint(type: string, paint: Record<string, unknown> | undefined, test: ThemeTest): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [property, kind] of PAINT[type] ?? []) {
    // A symbol without text or icon colour keeps its image: its opacity is enough.
    if (property === 'icon-color' && paint?.[property] == null) continue
    if (property === 'fill-outline-color' && paint?.[property] == null) continue
    if (property === 'circle-stroke-color' && paint?.[property] == null) continue
    const value = ghostValue(paint?.[property], kind, test)
    if (value != null) out[property] = value
  }
  return out
}

/** A washed-out base map (aerial photo, topographic map) under a thematic sheet. */
export const GHOST_RASTER_PAINT: Record<string, number> = { 'raster-saturation': -1, 'raster-brightness-min': 0.4, 'raster-contrast': -0.2 }
