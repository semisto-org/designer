// Two photos of the same spot, one over the other: drag the line to wipe
// from before to after, and see the garden grow. Each side carries its date,
// the newer one also how long after (« 1 an plus tard »).
import { useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import { haptics } from '@/lib/haptics'
import { formatDate, t } from '@/lib/i18n'
import { elapsed } from '@/lib/retake'
import type { Photo } from '@/lib/types'
import { MAX_FONT_SCALE } from './kit'
import { RemoteImage } from './RemoteImage'
import { colors, radius, space, type } from './theme'

const clamp = (x: number) => Math.min(1, Math.max(0, x))

/** A photo of the map, or one just taken and still on the phone. */
export type Shot = Photo | { local: string; takenAt: string; width?: number | null; height?: number | null }

export function BeforeAfter({ mapId, before, after }: { mapId: number; before: Shot; after: Shot }) {
  const [width, setWidth] = useState(0)
  const [split, setSplit] = useState(0.5)
  const start = useRef(0.5)
  const widthRef = useRef(0)
  const ratio = before.width && before.height ? before.width / before.height : 3 / 4
  const pan = useRef(PanResponder.create({
    // Sideways only: a vertical drag still scrolls the page.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event, g) => {
      haptics.select()
      start.current = widthRef.current ? clamp((event.nativeEvent.locationX - g.dx) / widthRef.current) : 0.5
    },
    onPanResponderMove: (_, gesture) => {
      if (widthRef.current) setSplit(clamp(start.current + gesture.dx / widthRef.current))
    },
  })).current
  const later = elapsed(before.takenAt, after.takenAt)
  const source = (shot: Shot) => ('local' in shot ? { local: shot.local } : { path: `/maps/${mapId}/photos/${shot.id}/image?size=large` })

  return (
    <View>
      <View style={[s.frame, { aspectRatio: ratio }]} onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width) }}
        {...pan.panHandlers}
        accessible accessibilityRole="adjustable" accessibilityLabel={t('mobile.retake.compare_label')}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(split * 100) }}
        onAccessibilityAction={(e) => setSplit((x) => clamp(x + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)))}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}>
        <RemoteImage {...source(after)} style={StyleSheet.absoluteFill} />
        <View style={[s.curtain, { width: width * split }]}>
          <RemoteImage {...source(before)} style={{ width, height: '100%' }} />
        </View>
        <View style={[s.line, { left: width * split - 1 }]} pointerEvents="none">
          <View style={s.knob} />
        </View>
      </View>
      <View style={s.legend}>
        <View style={{ flex: 1 }}>
          <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.retake.before')}</Text>
          <Text style={s.date} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatDate(before.takenAt)}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{later ?? t('mobile.retake.after')}</Text>
          <Text style={s.date} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatDate(after.takenAt)}</Text>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  frame: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.loam100 },
  curtain: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  knob: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.prune600 },
  legend: { flexDirection: 'row', marginTop: space.sm, gap: space.md },
  label: { ...type.hand, color: colors.prune700 },
  date: { ...type.meta, color: colors.loam500 },
})
