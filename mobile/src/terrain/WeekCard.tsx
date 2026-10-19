// « Cette semaine chez toi », at the top of the map screen: the frost to
// protect against first, then the heat, the week's nights and days, what
// the plants do this month and the tasks due. Nothing to say, no card.
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatDate, t } from '@/lib/i18n'
import { dayList, formatTemp, weekday, weekOf, type WeekReport } from '@/lib/week'
import { Body, MAX_FONT_SCALE } from '@/ui/kit'
import { colors, fonts, radius, space, type } from '@/ui/theme'

const RISK_NAMES = 4

export function WeekCard({ report }: { report: WeekReport }) {
  const week = weekOf(report)
  if (week.empty) return null
  const names = (list: string[], more: number) => (more > 0 ? t('mobile.week.more', { names: list.join(', '), count: more }) : list.join(', '))
  return (
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.week.title')}</Text>

      {week.frost && (
        <View style={[s.alert, s.frost]} accessibilityRole="alert">
          <Text style={s.alertTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.week.frost_title')}</Text>
          <Body>{t('mobile.week.frost', { temp: formatTemp(week.frost.minC), days: dayList(week.frost.dates) })}</Body>
          {week.frost.plants.length > 0
            ? <Body>{t('mobile.week.frost_plants', { names: names(week.frost.plants.slice(0, RISK_NAMES).map((p) => t('mobile.week.frost_plant', { name: p.name, temp: formatTemp(p.coldLimitC) })), week.frost.plants.length - RISK_NAMES) })}</Body>
            : <Body muted>{t('mobile.week.frost_none_at_risk')}</Body>}
          <Body muted>{t('mobile.week.frost_hint')}</Body>
        </View>
      )}
      {week.heat && (
        <View style={[s.alert, s.heat]} accessibilityRole="alert">
          <Text style={s.alertTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.week.heat_title')}</Text>
          <Body>{t('mobile.week.heat', { temp: formatTemp(week.heat.maxC), days: dayList(week.heat.dates) })}</Body>
        </View>
      )}

      {week.days.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {week.days.map((day) => (
            <View key={day.date} style={[s.day, day.tminC !== null && day.tminC <= 0 && s.frostDay]}
              accessible accessibilityLabel={t('mobile.week.days_label', { day: weekday(day.date), min: day.tminC === null ? '?' : formatTemp(day.tminC), max: day.tmaxC === null ? '?' : formatTemp(day.tmaxC) })}>
              <Text style={s.dayName} maxFontSizeMultiplier={1.3}>{weekday(day.date)}</Text>
              <Text style={s.dayTemp} maxFontSizeMultiplier={1.3}>{day.tminC === null ? '–' : formatTemp(day.tminC)}</Text>
              <Text style={s.dayMax} maxFontSizeMultiplier={1.3}>{day.tmaxC === null ? '–' : formatTemp(day.tmaxC)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {week.plants.map((p) => <Body key={p.key}>{t(`mobile.week.${p.key}`, { names: names(p.names, p.more) })}</Body>)}

      {week.tasks.length > 0 && (
        <View style={{ gap: space.xs }}>
          <Text style={s.alertTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.week.tasks')}</Text>
          {week.tasks.map((task) => (
            <Body key={task.id}>
              {task.title} · <Text style={task.overdue ? s.overdue : s.due}>{t(task.overdue ? 'mobile.week.overdue' : 'mobile.week.due', { date: formatDate(task.dueOn) })}</Text>
            </Body>
          ))}
        </View>
      )}

      {week.attribution && week.days.length > 0 && <Text style={s.meta} maxFontSizeMultiplier={1.3}>{t('mobile.week.source', { source: week.attribution })}</Text>}
    </View>
  )
}

const s = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.loam200 },
  title: { ...type.mapName, color: colors.loam900 },
  alert: { gap: space.xs, padding: space.sm, borderRadius: radius.md, borderLeftWidth: 4 },
  frost: { backgroundColor: colors.prune50, borderLeftColor: colors.prune600 },
  heat: { backgroundColor: colors.humus50, borderLeftColor: colors.humus500 },
  alertTitle: { ...type.meta, fontFamily: fonts.bold, color: colors.loam900 },
  day: { alignItems: 'center', minWidth: 64, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: colors.loam50 },
  frostDay: { backgroundColor: colors.prune100 },
  dayName: { ...type.meta, color: colors.loam600 },
  dayTemp: { ...type.meta, color: colors.prune700 },
  dayMax: { ...type.meta, color: colors.loam700 },
  due: { color: colors.loam600 },
  overdue: { color: colors.clay500 },
  meta: { ...type.meta, color: colors.loam500 },
})
