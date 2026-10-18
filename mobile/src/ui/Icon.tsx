// The app's icons: Lucide (the website's set), one stroke for all, hidden
// from screen readers (the button around an icon carries the label).
import {
  Apple, Aperture, Bandage, Bug, Flower2, Scissors, Wrench, BookOpen, Camera, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleQuestionMark, CloudOff, CloudRainWind, CloudUpload, Droplet, Droplets,
  Eye, EyeOff, Fence, Flag, Footprints, Heart, HeartPulse, Hourglass, Images, Info, Layers, Layers2, LocateFixed, MapPin, MapPinCheck, Navigation2, NotebookPen, PawPrint, Ruler, ScanSearch, Shovel, Sprout,
  SkipForward, Square, SquareCheck, TreeDeciduous, TriangleAlert, Undo2, Waves, Wind, X, type LucideIcon,
} from 'lucide-react-native'
import { colors } from './theme'

const ICONS = {
  back: ChevronLeft, next: ChevronRight, close: X, check: Check, undo: Undo2,
  photo: Camera, plant: Sprout, point: MapPin, measure: Ruler, identify: ScanSearch, trace: Footprints,
  display: Layers, follow: LocateFixed,
  note: NotebookPen, storm: CloudRainWind, planted: Shovel, followUp: HeartPulse, sheet: BookOpen,
  flowering: Flower2, pruning: Scissors, damage: Bandage, disease: Bug, intervention: Wrench, harvest: Apple,
  flows: Waves, pools: Droplet, seeps: Droplets,
  synced: CircleCheck, sending: CloudUpload, offline: CloudOff,
  info: Info, warning: TriangleAlert, error: CircleAlert,
  visit: Flag, ticked: SquareCheck, unticked: Square,
  heading: Navigation2, arrived: MapPinCheck, skip: SkipForward,
  retake: Images, ghost: Eye, ghostOff: EyeOff, shutter: Aperture,
  // The themes of a site visit's notes (lib/visit-core.ts).
  wish: Heart, water: Droplets, soil: Layers2, tree: TreeDeciduous, fauna: PawPrint, climate: Wind,
  neighbours: Fence, history: Hourglass, question: CircleQuestionMark, other: NotebookPen,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 24, color = colors.loam800, strokeWidth = 1.75 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const Glyph = ICONS[name]
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} absoluteStrokeWidth accessible={false} importantForAccessibility="no" />
}
