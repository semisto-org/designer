// The marks of a sketch drawn over a photo of w × h points: each line and
// note with a soft halo under it, so white reads on a sky and ink on a
// shadow, as on the website.
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { haloFor, linePath, type SketchMark } from '@/lib/sketch'
import { fonts } from './theme'

export function SketchLayer({ marks, width, height }: { marks: SketchMark[]; width: number; height: number }) {
  if (width <= 0 || height <= 0) return null
  const halo = Math.max(2, width * 0.004)
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {marks.map((mark, index) => mark.type === 'line' ? (
        <Line key={index} d={linePath(mark.points, width, height)} color={mark.color} strokeWidth={mark.width * width} halo={halo} />
      ) : (
        <Note key={index} x={mark.x * width} y={mark.y * height} size={mark.size * width} color={mark.color} text={mark.text} halo={halo} />
      ))}
    </Svg>
  )
}

function Line({ d, color, strokeWidth, halo }: { d: string; color: string; strokeWidth: number; halo: number }) {
  return (
    <>
      <Path d={d} stroke={haloFor(color)} strokeWidth={strokeWidth + halo} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  )
}

function Note({ x, y, size, color, text, halo }: { x: number; y: number; size: number; color: string; text: string; halo: number }) {
  return (
    <>
      <SvgText x={x} y={y} fontSize={size} fontFamily={fonts.hand} stroke={haloFor(color)} strokeWidth={halo} strokeLinejoin="round" fill={haloFor(color)}>{text}</SvgText>
      <SvgText x={x} y={y} fontSize={size} fontFamily={fonts.hand} fill={color}>{text}</SvgText>
    </>
  )
}
