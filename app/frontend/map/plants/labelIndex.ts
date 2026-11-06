/**
 * The name each plant wears on the map (number, own name or species and
 * variety, or the latin code), as the plants overlay last wrote it: the
 * hover label reads it when the names are hidden (map/drawing/LabelPeek).
 */
let labels = new Map<number, string>()

export function setPlantLabels(entries: Iterable<[number, string]>) {
  labels = new Map(entries)
}

export const plantLabelOf = (featureId: number): string | undefined => labels.get(featureId)
