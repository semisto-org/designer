// The opening: the app icon's four crowns (one tree seen from above at years
// 1, 5, 15 and 30) go back to year 1, then grow again one ring at a time with
// a little bounce, the tree hops, and it makes way for the app. It starts as
// the native splash's exact picture (same layers, size and paper), so the
// hand-over cannot be seen. With reduced motion it only fades; a tap skips it.
// The layers come from script/icons.mjs (mobile/assets/images/splash/).
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState } from 'react'
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native'
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { haptics } from '@/lib/haptics'
import { t } from '@/lib/i18n'
import { colors, fonts } from './theme'

// From year 30 (outside) to year 1 (centre), as in script/icons.mjs.
const CROWNS: ImageSourcePropType[] = [
  require('../../assets/images/splash/crown-0.png'),
  require('../../assets/images/splash/crown-1.png'),
  require('../../assets/images/splash/crown-2.png'),
  require('../../assets/images/splash/crown-3.png'),
]
// The pencil rings of years 30, 15 and 5; year 1 has the dot.
const RINGS: ImageSourcePropType[] = [
  require('../../assets/images/splash/ring-0.png'),
  require('../../assets/images/splash/ring-1.png'),
  require('../../assets/images/splash/ring-2.png'),
]
const DOT: ImageSourcePropType = require('../../assets/images/splash/dot.png')
const LAYER_COUNT = CROWNS.length + RINGS.length + 1

/** The splash image's width (app.json, expo-splash-screen imageWidth). */
export const LOGO_SIZE = 120
export const YEARS = [1, 5, 15, 30]
/** When the crown of each year (1, 5, 15, 30) grows back, in ms after the start. */
export const GROW_AT = [240, 460, 680, 900]
const REWIND_MS = 220
const HOP_AT = 1220
/** From the start until the tree has grown and hopped. */
export const GROWN_MS = 1600
export const EXIT_MS = 380
/** The native splash goes even if a layer never says it has loaded. */
export const LOAD_TIMEOUT_MS = 600

const bounce = { damping: 8, stiffness: 190, mass: 0.9 }

export function Opening({ ready, onDone }: {
  /** The app underneath can be shown. */
  ready: boolean
  /** The opening has gone: unmount it. */
  onDone: () => void
}) {
  const reduced = useReducedMotion()
  const [loaded, setLoaded] = useState(0)
  const [started, setStarted] = useState(false)
  const [grown, setGrown] = useState(false)
  const [year, setYear] = useState<number | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // crowns[i] and rings[i] follow script/icons.mjs: index 0 is year 30.
  const crowns = [useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1)]
  const rings = [useSharedValue(1), useSharedValue(1), useSharedValue(1)]
  const hop = useSharedValue(0)
  const breathe = useSharedValue(0)
  const label = useSharedValue(0)
  const pop = useSharedValue(0)
  const leave = useSharedValue(0)

  const later = (ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)) }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Hand over from the native splash once the same picture is on screen.
  useEffect(() => {
    if (started) return
    const go = () => {
      setStarted(true)
      SplashScreen.hideAsync().catch(() => undefined)
    }
    if (loaded >= LAYER_COUNT) return go()
    const timer = setTimeout(go, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [loaded, started])

  useEffect(() => {
    if (!started) return
    if (reduced) return setGrown(true)
    const rewind = { duration: REWIND_MS, easing: Easing.in(Easing.cubic) }
    YEARS.forEach((_, y) => {
      const i = 3 - y
      if (y === 0) {
        // Year 1 stays: it squashes a little, then springs back.
        crowns[i].value = withSequence(withTiming(0.8, rewind), withSpring(1, bounce))
      } else {
        crowns[i].value = withSequence(withTiming(0, rewind), withDelay(GROW_AT[y] - REWIND_MS, withSpring(1, bounce)))
        // The pencil ring is drawn just after its crown.
        rings[i].value = withSequence(withTiming(0, rewind), withDelay(GROW_AT[y] - REWIND_MS + 110, withSpring(1, { damping: 14, stiffness: 160 })))
      }
      later(GROW_AT[y], () => {
        setYear(YEARS[y])
        pop.value = withSequence(withTiming(1, { duration: 90 }), withSpring(0, bounce))
        if (y > 0) haptics.select()
      })
    })
    label.value = withDelay(GROW_AT[0], withTiming(1, { duration: 200 }))
    hop.value = withDelay(HOP_AT, withSequence(withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 6, stiffness: 210 })))
    later(GROWN_MS, () => setGrown(true))
  }, [started, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  // Still loading once grown: the tree breathes until the app is there.
  useEffect(() => {
    if (!grown || ready || reduced) return
    breathe.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1)
  }, [grown, ready, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  const exit = () => {
    if (leaving) return
    setLeaving(true)
    breathe.value = withTiming(0, { duration: 120 })
    const duration = reduced ? 200 : EXIT_MS
    leave.value = withTiming(1, { duration, easing: Easing.in(Easing.quad) })
    later(duration, onDone)
  }

  useEffect(() => { if (grown && ready) exit() }, [grown, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const overlay = useAnimatedStyle(() => ({ opacity: 1 - leave.value }))
  const logo = useAnimatedStyle(() => ({
    transform: [
      { translateY: -10 * hop.value },
      { scale: (1 + 0.06 * hop.value) * (1 + 0.03 * breathe.value) * (1 + 0.6 * leave.value) },
    ],
  }))
  const caption = useAnimatedStyle(() => ({
    opacity: label.value * (1 - leave.value),
    transform: [{ scale: 1 + 0.18 * pop.value }],
  }))

  const onLoad = () => setLoaded((n) => n + 1)

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, s.overlay, overlay]}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onTouchEnd={() => { if (ready) exit() }}
      testID="opening"
    >
      <Animated.View style={[s.logo, logo]}>
        {CROWNS.map((source, i) => <Layer key={`c${i}`} source={source} value={crowns[i]} onLoad={onLoad} />)}
        {RINGS.map((source, i) => <Layer key={`r${i}`} source={source} value={rings[i]} from={0.88} onLoad={onLoad} />)}
        <Layer source={DOT} value={crowns[3]} onLoad={onLoad} />
        <Animated.Text style={[s.year, caption]}>{year === null ? '' : t('mobile.opening.years', { count: year })}</Animated.Text>
      </Animated.View>
    </Animated.View>
  )
}

/** One layer of the icon, grown from `from` (its size at value 0) to full size at 1. */
function Layer({ source, value, from = 0, onLoad }: { source: ImageSourcePropType; value: SharedValue<number>; from?: number; onLoad: () => void }) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, value.value * 2.5)),
    transform: [{ scale: from + (1 - from) * value.value }],
  }))
  return <Animated.View style={[StyleSheet.absoluteFill, style]}><Image source={source} style={s.image} onLoadEnd={onLoad} fadeDuration={0} /></Animated.View>
}

const s = StyleSheet.create({
  overlay: { backgroundColor: colors.loam50, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  image: { width: LOGO_SIZE, height: LOGO_SIZE },
  // Under the tree, out of the centring: the logo stays where the splash put it.
  year: { position: 'absolute', top: LOGO_SIZE + 14, left: -60, right: -60, textAlign: 'center', fontFamily: fonts.hand, fontSize: 24, lineHeight: 28, color: colors.prune700 },
})
