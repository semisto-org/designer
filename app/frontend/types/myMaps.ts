import type { Geometry } from 'geojson'

/** Any GeoJSON geometry the sketch draws (simplified server-side). */
export type SketchGeometry = Geometry & { coordinates: unknown }

/** What « Mes cartes » paints of a terrain (MapSketch on the server). */
export type MapSketchData = {
  /** Active palette items counted per strata. */
  palette: Record<string, number>
  /** [lng, lat, strata, adult spread in metres] */
  plants: [number, number, string, number][]
  water: SketchGeometry[]
  hedges: SketchGeometry[]
  buildings: SketchGeometry[]
  /** Existing trees, [lng, lat]. */
  trees: [number, number][]
}

/** The next step of the map worked on last (Journey#next_action). */
export type ResumeStep =
  | { type: 'item'; step: string; item: string; panel?: string }
  | { type: 'advance'; stage: string }
  | { type: 'complete' }

export type Resume = { mapId: number; next: ResumeStep }
