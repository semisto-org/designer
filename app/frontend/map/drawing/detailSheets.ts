/**
 * Detail sheets of a numbered plan: each crowded bed, gathered in one pill
 * on the plan (« A · 125–133 »), gets a page of its own right after it, at
 * a scale where every plant's number reads (map/drawing/pdf). Pure, tested
 * in test/frontend/drawing.
 */

/** The detail sheets' scales, the closest first: the first that holds the whole cluster is used. */
const DETAIL_SCALES = [50, 100, 200]

/** The scale and centre of a cluster's detail sheet: its plants fill the frame, with room around them. */
export function detailFrame(bounds: [number, number, number, number], frame: { w: number; h: number }, planScale: number): { scale: number; center: [number, number] } {
  const [w, s, e, n] = bounds
  const center: [number, number] = [(w + e) / 2, (s + n) / 2]
  const metersPerDegree = 111_320
  const widthM = (e - w) * metersPerDegree * Math.cos((center[1] * Math.PI) / 180) + 2
  const heightM = (n - s) * metersPerDegree + 2
  // mm on paper = metres × 1000 / scale.
  const fits = (scale: number) => (widthM * 1000) / scale <= frame.w * 0.85 && (heightM * 1000) / scale <= frame.h * 0.85
  const scale = DETAIL_SCALES.find((d) => d < planScale && fits(d)) ?? Math.min(planScale, DETAIL_SCALES[DETAIL_SCALES.length - 1])
  return { scale, center }
}

