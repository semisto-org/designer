// The app's few building blocks, in the website's look.
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'
import { colors, fonts, radius, shadow, space } from './theme'

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  busy?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({ label, variant = 'primary', busy, disabled, style, ...props }: ButtonProps) {
  const palette = {
    primary: { bg: colors.prune600, fg: colors.white, border: colors.prune600 },
    secondary: { bg: colors.white, fg: colors.prune600, border: colors.prune600 },
    danger: { bg: colors.white, fg: colors.clay700, border: colors.clay500 },
    ghost: { bg: 'transparent', fg: colors.prune600, border: 'transparent' },
  }[variant]
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      style={({ pressed }) => [styles.button, { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
      {...props}
    >
      {busy ? <ActivityIndicator color={palette.fg} /> : <Text style={[styles.buttonLabel, { color: palette.fg }]}>{label}</Text>}
    </Pressable>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function Body({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Text style={[styles.body, muted && styles.muted, style as object]}>{children}</Text>
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.loam500} {...props} style={[styles.input, props.multiline && styles.multiline, props.style]} />
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'error' }) {
  const bg = { info: colors.prune50, warning: colors.humus50, error: colors.clay50 }[tone]
  const fg = { info: colors.prune700, warning: colors.humus700, error: colors.clay700 }[tone]
  return <View style={[styles.notice, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 14, fontFamily: fonts.body }}>{children}</Text></View>
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.prune600, borderColor: colors.prune600 }]}>
      <Text style={{ color: selected ? colors.white : colors.loam700, fontSize: 14, fontFamily: fonts.medium }}>{label}</Text>
    </Pressable>
  )
}

export const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontSize: 16, fontFamily: fonts.bold },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space.lg, ...shadow },
  title: { fontSize: 26, fontFamily: fonts.title, color: colors.loam900 },
  body: { fontSize: 15, fontFamily: fonts.body, color: colors.loam900, lineHeight: 21 },
  muted: { color: colors.loam600 },
  label: { fontSize: 13, fontFamily: fonts.bold, color: colors.loam600, marginBottom: space.xs, marginTop: space.md },
  input: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.loam200, backgroundColor: colors.white, paddingHorizontal: space.md, fontSize: 16, fontFamily: fonts.body, color: colors.loam900 },
  multiline: { minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' },
  notice: { borderRadius: radius.md, padding: space.md },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.loam200, paddingHorizontal: space.md, paddingVertical: 8, backgroundColor: colors.white },
  screen: { flex: 1, backgroundColor: colors.loam50 },
  content: { padding: space.lg, gap: space.md },
})
