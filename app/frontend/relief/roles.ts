// What a land cover class means for the "blocks" view and the Niva: a road,
// a building, water or forest. The codes are the region's (WalOUS in
// Wallonia, others elsewhere); each class names its role in the region
// settings (`relief.landcover_classes.<code>.kind`), so nothing here knows
// one region's codes. A class without a role reads as grass.

import type { LandcoverClassData } from '@/types/relief'

export const ROLE = { none: 0, road: 1, building: 2, water: 3, forest: 4 } as const
export type Role = (typeof ROLE)[keyof typeof ROLE]

const BY_KIND: Record<string, Role> = { road: ROLE.road, building: ROLE.building, water: ROLE.water, forest: ROLE.forest }

/** One role per grid cell, or null without a land cover (or without any role in the classes). */
export function landcoverRoles(landcover: Uint8Array | null, classes: Record<string, LandcoverClassData>): Uint8Array | null {
  if (!landcover) return null
  const lookup = new Uint8Array(256)
  let any = false
  for (const [code, item] of Object.entries(classes)) {
    const role = item.kind ? BY_KIND[item.kind] : undefined
    const index = Number(code)
    if (role && Number.isInteger(index) && index >= 0 && index < 256) {
      lookup[index] = role
      any = true
    }
  }
  if (!any) return null
  const roles = new Uint8Array(landcover.length)
  for (let i = 0; i < landcover.length; i++) roles[i] = lookup[landcover[i]]
  return roles
}
