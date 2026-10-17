// The app's building blocks, in the website's look and on paper: big
// enough for gloves (48 pt, 56 for the main actions), never under 14 px,
// every control named for the screen reader.
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'
import { haptics } from '@/lib/haptics'
import { Icon, type IconName } from './Icon'
import { colors, fonts, radius, shadow, shadows, space, touch, type } from './theme'

// Text grows with the phone's text size, up to a point where layouts still hold.
export const MAX_FONT_SCALE = 1.6

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  icon?: IconName
  busy?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({ label, variant = 'primary', icon, busy, disabled, style, onPress, ...props }: ButtonProps) {
  const palette = {
    primary: { bg: colors.prune600, fg: colors.white, border: colors.prune600 },
    secondary: { bg: colors.paper, fg: colors.prune700, border: colors.prune600 },
    danger: { bg: colors.paper, fg: colors.clay700, border: colors.clay500 },
    ghost: { bg: 'transparent', fg: colors.prune700, border: 'transparent' },
  }[variant]
  const off = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={off}
      onPress={(event) => { haptics.tap(); onPress?.(event) }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        disabled && styles.disabled,
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
      {...props}
    >
      {busy ? <ActivityIndicator color={palette.fg} /> : icon ? <Icon name={icon} size={20} color={disabled ? colors.loam500 : palette.fg} /> : null}
      <Text style={[styles.buttonLabel, { color: disabled ? colors.loam500 : palette.fg }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
    </Pressable>
  )
}

/** A round or square paper button with only an icon: the label is for the screen reader. */
export function IconButton({ icon, label, onPress, active, dot, size = touch.field }: {
  icon: IconName; label: string; onPress: () => void; active?: boolean; dot?: boolean; size?: number
}) {
  return (
    <Pressable
      onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      style={({ pressed }) => [styles.iconButton, { width: size, height: size }, active && styles.iconButtonActive, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      <Icon name={icon} color={active ? colors.prune800 : colors.loam800} />
      {dot && <View style={styles.dot} />}
    </Pressable>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{children}</Text>
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={styles.heading} maxFontSizeMultiplier={MAX_FONT_SCALE}>{children}</Text>
}

export function Body({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Text style={[styles.body, muted && styles.muted, style as object]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{children}</Text>
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{children}</Text>
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.loam400} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} style={[styles.input, props.multiline && styles.multiline, props.style]} />
}

/** Information that appears by itself: read aloud when it shows. */
export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'error' }) {
  const bg = { info: colors.prune50, warning: colors.humus50, error: colors.clay50 }[tone]
  const fg = { info: colors.prune800, warning: colors.humus700, error: colors.clay700 }[tone]
  return (
    <View accessibilityLiveRegion="polite" accessible style={[styles.notice, { backgroundColor: bg }]}>
      <Icon name={tone} size={20} color={fg} />
      <Text style={{ flex: 1, color: fg, ...type.meta }} maxFontSizeMultiplier={MAX_FONT_SCALE}>{children}</Text>
    </View>
  )
}

/**
 * A choice among others. `role` says how it is read: radio (one among a
 * group), checkbox (several), or a plain button.
 */
export function Chip({ label, selected, onPress, role = 'button' }: { label: string; selected?: boolean; onPress: () => void; role?: 'button' | 'radio' | 'checkbox' }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: !!selected } : { selected: !!selected, checked: role === 'radio' ? !!selected : undefined }}
      onPress={() => { haptics.select(); onPress() }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      {selected && <Icon name="check" size={18} color={colors.white} />}
      <Text style={{ color: selected ? colors.white : colors.loam800, fontSize: 15, fontFamily: fonts.medium }} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
    </Pressable>
  )
}

export const styles = StyleSheet.create({
  button: {
    minHeight: touch.min, borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: space.lg,
    flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center',
  },
  // Disabled stays readable in the sun: a grey outline, not a faded copy.
  disabled: { backgroundColor: colors.loam100, borderColor: colors.loam300 },
  buttonLabel: { fontSize: 16, fontFamily: fonts.bold },
  iconButton: {
    borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.loam200,
    alignItems: 'center', justifyContent: 'center', ...shadows.md,
  },
  iconButtonActive: { backgroundColor: colors.prune100, borderColor: colors.prune300 },
  dot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.prune600, borderWidth: 1.5, borderColor: colors.white },
  card: { backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.loam200, padding: space.lg, ...shadow },
  title: { ...type.title, color: colors.loam900 },
  heading: { ...type.heading, color: colors.loam900 },
  body: { ...type.body, color: colors.loam900 },
  muted: { color: colors.loam500 },
  label: { ...type.label, color: colors.loam600, marginBottom: space.xs, marginTop: space.md },
  input: {
    minHeight: touch.min, borderRadius: radius.md, borderWidth: 1, borderColor: colors.loam300, backgroundColor: colors.paper,
    paddingHorizontal: space.md, fontSize: 16, fontFamily: fonts.body, color: colors.loam900,
  },
  multiline: { minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, borderRadius: radius.md, padding: space.md },
  chip: {
    minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.loam300, paddingHorizontal: space.lg, backgroundColor: colors.paper,
  },
  chipSelected: { backgroundColor: colors.prune600, borderColor: colors.prune600 },
  screen: { flex: 1, backgroundColor: colors.loam50 },
  content: { padding: space.lg, gap: space.md },
})
