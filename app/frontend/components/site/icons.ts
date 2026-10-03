import { Camera, Layers, Map as MapIcon, MapPinned, Mountain, Pencil, Sparkles, Sprout, Users, type LucideIcon } from 'lucide-react'

/** Icon names used in the page copy (config/locales/site.fr.yml). */
export const ICONS: Record<string, LucideIcon> = {
  map: MapIcon,
  layers: Layers,
  pencil: Pencil,
  sprout: Sprout,
  sparkles: Sparkles,
  users: Users,
  mountain: Mountain,
  camera: Camera,
  pin: MapPinned,
}

export function iconFor(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || MapIcon
}
