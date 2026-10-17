// The app's icons: Lucide (the website's set), one stroke for all, hidden
// from screen readers (the button around an icon carries the label).
import {
  Camera, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CloudOff, CloudUpload, Droplet, Droplets, Footprints,
  Info, Layers, LocateFixed, MapPin, ScanSearch, Sprout, TriangleAlert, Undo2, Waves, X, type LucideIcon,
} from 'lucide-react-native'
import { colors } from './theme'

const ICONS = {
  back: ChevronLeft, next: ChevronRight, close: X, check: Check, undo: Undo2,
  photo: Camera, plant: Sprout, point: MapPin, identify: ScanSearch, trace: Footprints,
  display: Layers, follow: LocateFixed,
  flows: Waves, pools: Droplet, seeps: Droplets,
  synced: CircleCheck, sending: CloudUpload, offline: CloudOff,
  info: Info, warning: TriangleAlert, error: CircleAlert,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 24, color = colors.loam800, strokeWidth = 1.75 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const Glyph = ICONS[name]
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} absoluteStrokeWidth accessible={false} importantForAccessibility="no" />
}
