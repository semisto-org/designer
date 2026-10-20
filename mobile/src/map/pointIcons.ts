// The white glyphs on the map's point discs, given to MapLibre by name
// (FeatureLayers' <Images>). Drawn by scripts/map-icons.mjs; the names are
// POINT_ICON_NAMES (lib/elements.ts).
import type { ImageRequireSource } from 'react-native'
import type { PointIcon } from '@/lib/elements'

export const POINT_ICON_IMAGES: Record<PointIcon, ImageRequireSource> = {
  'calendar-days': require('../../assets/map-icons/calendar-days.png'),
  'circle-dot': require('../../assets/map-icons/circle-dot.png'),
  'circle-gauge': require('../../assets/map-icons/circle-gauge.png'),
  'cloud-rain': require('../../assets/map-icons/cloud-rain.png'),
  'cylinder': require('../../assets/map-icons/cylinder.png'),
  'door-open': require('../../assets/map-icons/door-open.png'),
  'droplet': require('../../assets/map-icons/droplet.png'),
  'egg': require('../../assets/map-icons/egg.png'),
  'faucet': require('../../assets/map-icons/faucet.png'),
  'gauge': require('../../assets/map-icons/gauge.png'),
  'hexagon': require('../../assets/map-icons/hexagon.png'),
  'moon': require('../../assets/map-icons/moon.png'),
  'plug-zap': require('../../assets/map-icons/plug-zap.png'),
  'recycle': require('../../assets/map-icons/recycle.png'),
  'sticky-note': require('../../assets/map-icons/sticky-note.png'),
  'thermometer-snowflake': require('../../assets/map-icons/thermometer-snowflake.png'),
  'tree-deciduous': require('../../assets/map-icons/tree-deciduous.png'),
  'paw-print': require('../../assets/map-icons/paw-print.png'),
  'flower-2': require('../../assets/map-icons/flower-2.png'),
  'sprout': require('../../assets/map-icons/sprout.png'),
  'map-pin': require('../../assets/map-icons/map-pin.png'),
}
