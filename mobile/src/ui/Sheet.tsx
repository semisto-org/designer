// The terrain's notebook page over the map: one sheet at three heights.
// At its lowest it shows only its top (`top`, measured), then half the
// screen, then nearly all of it. Dragged by its top, or tapped there; a
// screen reader moves it with swipe up and down (an adjustable control).
// On a tablet (`docked`) it is a column on the left beside the map: folded
// to its top, or open from under the header to the bottom of the screen.
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { haptics } from '@/lib/haptics'
import { t } from '@/lib/i18n'
import { colors, radius, shadows, space } from './theme'

export type SheetLevel = 0 | 1 | 2

const HANDLE = 28

export function Sheet({ level, onLevel, top, children, bottomInset, topInset, docked }: {
  level: SheetLevel
  onLevel: (level: SheetLevel) => void
  /** Always visible: the sheet's lowest height is this part's height. */
  top: React.ReactNode
  /** Shown as the sheet grows, and scrolled when it is taller than the sheet. */
  children?: React.ReactNode
  bottomInset: number
  /** Room kept above the sheet at its highest (the header). */
  topInset: number
  /** A tablet: the sheet is a column of this width on the left, above the bottom inset. */
  docked?: { width: number }
}) {
  const screen = useWindowDimensions().height
  const [topHeight, setTopHeight] = useState(140)
  const reduced = useReducedMotion()
  // Docked, the column floats above the home indicator: the inset is a margin, not padding.
  const margin = Math.max(space.md, bottomInset)
  const peek = HANDLE + topHeight + (docked ? space.sm : bottomInset)
  const full = Math.max(peek, screen - topInset - (docked ? margin : 0))
  const heights = docked ? [peek, full, full] : [peek, Math.max(peek, screen * 0.5), full]
  const height = useSharedValue(heights[level])
  const start = useSharedValue(0)

  // Like the wind: a soft spring, no bounce; none at all when motion is reduced.
  const settle = (to: number) => {
    'worklet'
    height.value = reduced ? withTiming(to, { duration: 0 }) : withSpring(to, { damping: 28, stiffness: 240, overshootClamping: true })
  }

  useEffect(() => { settle(heights[level]) }, [level, heights[0], heights[1], heights[2]]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (next: number) => {
    const to = Math.max(0, Math.min(2, next)) as SheetLevel
    if (to !== level) haptics.select()
    onLevel(to)
    settle(heights[to])
  }

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onStart(() => { start.value = height.value })
    .onUpdate((e) => { height.value = Math.max(heights[0], Math.min(heights[2], start.value - e.translationY)) })
    .onEnd((e) => {
      // A flick goes one step in its direction; a slow drag stops at the nearest height.
      const now = height.value
      let next = 0
      if (Math.abs(e.velocityY) > 600) {
        if (e.velocityY < 0) {
          next = 2
          for (let i = 2; i >= 0; i--) if (heights[i] > now + 1) next = i
        } else {
          for (let i = 0; i < 3; i++) if (heights[i] < now - 1) next = i
        }
      } else {
        for (let i = 1; i < 3; i++) if (Math.abs(heights[i] - now) < Math.abs(heights[next] - now)) next = i
      }
      scheduleOnRN(choose, next)
    })

  const animated = useAnimatedStyle(() => ({ height: height.value }))
  const measure = (e: LayoutChangeEvent) => {
    const measured = Math.round(e.nativeEvent.layout.height)
    if (Math.abs(measured - topHeight) > 1) setTopHeight(measured)
  }

  return (
    <Animated.View style={[s.sheet, docked && [s.docked, { width: docked.width, bottom: margin }], animated]}>
      <GestureDetector gesture={pan}>
        <View>
          <Pressable
            style={s.handleZone}
            onPress={() => choose(level === 0 ? 1 : 0)}
            accessibilityRole="adjustable"
            accessibilityLabel={t('mobile.sheet.label')}
            accessibilityValue={{ text: t(`mobile.sheet.levels.${level}`) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => choose(level + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
          >
            <View style={s.handle} />
          </Pressable>
          <View onLayout={measure}>{top}</View>
        </View>
      </GestureDetector>
      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: (docked ? 0 : bottomInset) + space.lg }} scrollEnabled={level > 0}>
        {children}
      </ScrollView>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden',
    backgroundColor: colors.paper, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.loam200, ...shadows.lg,
  },
  docked: { left: space.md, right: undefined, borderRadius: radius.sheet, borderBottomWidth: 1 },
  handleZone: { height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.loam300 },
  body: { flex: 1 },
})
