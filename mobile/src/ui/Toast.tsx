// Confirmations that do not stop the walk: a paper note slides in at the
// top, is read aloud by the screen reader, and goes away by itself (no
// system alert to dismiss with a muddy thumb).
import { useEffect, useSyncExternalStore } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { haptics } from '@/lib/haptics'
import { Icon } from './Icon'
import { colors, fonts, radius, shadows, space, type } from './theme'

type Tone = 'success' | 'info' | 'warning' | 'error'
type Action = { label: string; onPress: () => void }
type Toast = { id: number; title: string; body?: string; tone: Tone; action?: Action }

let current: Toast | null = null
let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Shows a short confirmation, with an optional action (« Annuler »); replaces the previous one. */
export function toast(title: string, { body, tone = 'success', action }: { body?: string; tone?: Tone; action?: Action } = {}) {
  current = { id: nextId++, title, body, tone, action }
  if (tone === 'success') haptics.success()
  else if (tone !== 'info') haptics.warning()
  AccessibilityInfo.announceForAccessibility([title, body].filter(Boolean).join('. '))
  if (timer) clearTimeout(timer)
  // An action needs time to be reached, by thumb or screen reader.
  timer = setTimeout(dismiss, action ? 7000 : body ? 5000 : 3500)
  emit()
}

function dismiss() {
  current = null
  emit()
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** Mounted once, above every screen. */
export function ToastHost() {
  const shown = useSyncExternalStore(subscribe, () => current)
  const insets = useSafeAreaInsets()
  useEffect(() => () => { if (timer) clearTimeout(timer) }, [])
  if (!shown) return null
  const icon = shown.tone === 'success' ? 'synced' : shown.tone
  const tint = { success: colors.leaf700, info: colors.prune700, warning: colors.humus600, error: colors.clay700 }[shown.tone]
  return (
    <View pointerEvents="box-none" style={[s.host, { top: insets.top + 64 }]}>
      <Animated.View key={shown.id} entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)}>
        {/* The note and its action side by side, never one button inside the other. */}
        <View accessibilityRole="alert" style={s.toast}>
          <Pressable onPress={dismiss} style={s.note}>
            <Icon name={icon} color={tint} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.title} maxFontSizeMultiplier={1.6}>{shown.title}</Text>
              {shown.body ? <Text style={s.body} maxFontSizeMultiplier={1.6}>{shown.body}</Text> : null}
            </View>
          </Pressable>
          {shown.action && (
            <Pressable accessibilityRole="button" accessibilityLabel={shown.action.label} style={s.action}
              onPress={() => { const run = shown.action!.onPress; dismiss(); haptics.tap(); run() }}>
              <Text style={s.actionLabel} maxFontSizeMultiplier={1.6}>{shown.action.label}</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  )
}

const s = StyleSheet.create({
  host: { position: 'absolute', left: space.md, right: space.md, zIndex: 100 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.md,
    backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.loam200, ...shadows.md,
  },
  title: { ...type.label, fontSize: 16, color: colors.loam900, fontFamily: fonts.bold },
  body: { ...type.meta, color: colors.loam600 },
  note: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  action: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: space.sm },
  actionLabel: { ...type.label, fontSize: 16, color: colors.prune700 },
})
