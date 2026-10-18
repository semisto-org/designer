/**
 * Shift+drag on the map: the map editor turns the box into a selection
 * (every element inside it); anywhere else, or for a viewer, the box zooms
 * as MapLibre does by default. MapLibre takes this callback only when the
 * map is created, hence a slot the editor fills once it is mounted.
 */
export const boxSelect: { handler: ((from: { x: number; y: number }, to: { x: number; y: number }) => void) | null } = { handler: null }
