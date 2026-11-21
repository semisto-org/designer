// A plant's strata as a little watercolour beside its name, as on the
// website's plant page (components/plants/StrataPlate.tsx). Without the
// website's paper filter, the wash is laid twice, a little apart, so its
// edge stays soft like watercolour.
import Svg, { G, Path } from 'react-native-svg'
import { PLATE_COLORS, PLATE_INK, PLATE_VIEWBOX, STRATA_PLATES } from '@/lib/specimen'

export function StrataPlate({ strata, width = 112, height = 90 }: { strata: string; width?: number; height?: number }) {
  const marks = STRATA_PLATES[strata] ?? STRATA_PLATES.shrub
  const color = PLATE_COLORS[strata] ?? PLATE_COLORS.shrub
  const washes = marks.filter((m) => m.kind !== 'ink')
  return (
    <Svg width={width} height={height} viewBox={PLATE_VIEWBOX} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G transform="translate(1.2 0.8)">
        {washes.map((m, i) => <Path key={`a${i}`} d={m.d} fill={color} fillOpacity={0.22} />)}
      </G>
      {washes.map((m, i) => <Path key={`b${i}`} d={m.d} fill={color} fillOpacity={m.kind === 'deep' ? 0.4 : 0.42} stroke={color} strokeOpacity={0.45} strokeWidth={0.8} />)}
      {marks.filter((m) => m.kind === 'ink').map((m, i) => <Path key={`c${i}`} d={m.d} fill="none" stroke={PLATE_INK} strokeWidth={1.1} strokeLinecap="round" />)}
    </Svg>
  )
}
