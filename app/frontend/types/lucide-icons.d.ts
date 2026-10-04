// Raw icon data of single lucide icons (drawn on the map canvas by
// map/drawing/icons.ts). Each icon module exports its node list.
declare module 'lucide-react/dist/esm/icons/*.mjs' {
  import type { LucideIconData } from 'lucide-react'
  export const __iconData: LucideIconData
}
