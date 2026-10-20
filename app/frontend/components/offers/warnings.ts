import type { OfferWarning, Phase } from '@/types/offers'

export type ShownWarning = OfferWarning & { phases?: Phase[] }

/**
 * The warnings as the page shows them: trips without a distance in one
 * line naming their phases, and nothing about the design share or the
 * budget while the scope is empty (without planting, design is always most
 * of the total, and the alert would only frighten).
 */
export function groupWarnings(warnings: OfferWarning[]): ShownWarning[] {
  const noScope = warnings.some((warning) => warning.code === 'no_scope')
  const tripPhases = warnings.filter((warning) => warning.code === 'trip_without_km').map((warning) => warning.phase).filter((phase): phase is Phase => !!phase)
  const shown: ShownWarning[] = []
  for (const warning of warnings) {
    if (noScope && (warning.code === 'design_share' || warning.code === 'over_budget')) continue
    if (warning.code !== 'trip_without_km') shown.push(warning)
    else if (!shown.some((other) => other.code === 'trips_without_km')) shown.push({ code: 'trips_without_km', phases: [...new Set(tripPhases)] })
  }
  return shown
}
