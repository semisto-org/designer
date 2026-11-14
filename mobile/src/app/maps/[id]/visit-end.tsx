// The end of a site visit: what was noted, theme by theme, and the open
// questions, ticked to become tasks about their note. Closing sends the
// visit through the outbox; the server files its report in the map's
// documents (SiteVisit), grouped like this screen, with the sound of the
// walk beside it when it was recorded, and its track. On a Pro or Team
// project, the time spent on the land goes into « Temps et dépenses » too:
// the visit's length rounded to the quarter hour, the likely phase and the
// usual trip, all prefilled, so ending the visit is enough.
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { featureTitle } from '@/lib/elements'
import { haptics } from '@/lib/haptics'
import { t, todayIso } from '@/lib/i18n'
import { visits, useVisit } from '@/lib/visit'
import { clock, countByTheme, duration, parseKm, questionsOf, stepMinutes, visitDay, visitMinutes, visitNotes, walked } from '@/lib/visit-core'
import { visitAudio } from '@/lib/visitAudio'
import { visitTrack } from '@/lib/visitTrack'
import { useMapBundle } from '@/state/useMapBundle'
import { Icon } from '@/ui/Icon'
import { Body, Button, Chip, IconButton, Input, MAX_FONT_SCALE } from '@/ui/kit'
import { toast } from '@/ui/Toast'
import { colors, fonts, space, touch, type } from '@/ui/theme'
import { readable } from '@/ui/layout'

export default function VisitEnd() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle } = useMapBundle(mapId)
  const visit = useVisit(mapId)
  const insets = useSafeAreaInsets()
  const notes = useMemo(() => (bundle && visit ? visitNotes(bundle, visit.key) : []), [bundle, visit])
  const questions = questionsOf(notes)
  const [unticked, setUnticked] = useState<Set<number>>(new Set())
  const [closing, setClosing] = useState(false)
  const sound = visit?.audio ? visitAudio.state() : null
  const meters = visit ? visitTrack.meters(visit.key) : 0
  const sheet = bundle?.timesheet ?? null
  const [keepTime, setKeepTime] = useState(true)
  const [minutes, setMinutes] = useState(() => (visit ? visitMinutes(visit.startedAt) : 60))
  const [phase, setPhase] = useState<string | null>(null)
  const [trip, setTrip] = useState<boolean | null>(null)
  const [km, setKm] = useState<string | null>(null)
  const step = sheet?.stepMinutes ?? 15
  const chosenPhase = phase ?? sheet?.defaultPhase ?? 'pre_design'
  const usual = sheet?.usualTrip ?? null
  const withTrip = trip ?? !!usual
  const kmText = km ?? (usual ? String(usual.km).replace('.', ',') : '')

  const toggle = (id: number) => setUnticked((all) => {
    const next = new Set(all)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const close = async () => {
    if (!visit) return
    setClosing(true)
    const day = visitDay(visit.startedAt)
    const withSound = !!visit.audio
    const tripKm = withTrip ? parseKm(kmText) : null
    const time = sheet && keepTime ? {
      workedOn: todayIso(new Date(visit.startedAt)), minutes, phase: chosenPhase, note: t('mobile.visit.time.note'),
      tripKm, tripFrom: tripKm ? usual?.from ?? null : null, tripTo: tripKm ? usual?.to ?? null : null,
    } : null
    await visits.close(mapId, questions.map((q) => q.id).filter((id) => !unticked.has(id)), time)
    haptics.success()
    const report = t(withSound ? 'mobile.visit.closed_with_sound' : 'mobile.visit.closed', { date: day })
    toast(t('mobile.visit.closed_title'), { body: time ? `${report} ${t('mobile.visit.time.closed', { duration: duration(minutes) })}` : report })
    router.back()
  }

  return (
    <ScrollView style={s.fill} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + space.xl }]}>
      <Body muted>{t('mobile.visit.end_intro')}</Body>

      <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.summary')}</Text>
      {notes.length === 0 && <Body muted>{t('mobile.visit.notes', { count: 0 })}</Body>}
      {countByTheme(notes).map(({ theme, count }) => (
        <View key={theme} style={s.row} accessible accessibilityLabel={`${t(`mobile.visit.themes.${theme}`)}, ${t('mobile.visit.notes', { count })}`}>
          <Icon name={theme} size={22} color={colors.prune700} />
          <Text style={s.rowTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t(`mobile.visit.themes.${theme}`)}</Text>
          <Text style={s.count} maxFontSizeMultiplier={1.3}>{count}</Text>
        </View>
      ))}

      {(sound || meters > 0) && (
        <>
          <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.recorded')}</Text>
          {sound && visit && (
            <View style={s.row} accessible>
              <Icon name="sound" size={22} color={colors.prune700} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.record.sound')}{sound.live ? ` · ${clock(sound.seconds)}` : ''}</Text>
                <Text style={s.meta} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.end_sound', { date: visitDay(visit.startedAt) })}</Text>
              </View>
            </View>
          )}
          {meters > 0 && (
            <View style={s.row} accessible>
              <Icon name="walk" size={22} color={colors.prune700} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.record.walk')} · {walked(meters)}</Text>
                <Text style={s.meta} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.end_walk')}</Text>
              </View>
            </View>
          )}
        </>
      )}

      {questions.length > 0 && (
        <>
          <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.questions')}</Text>
          <Body muted>{t('mobile.visit.questions_hint')}</Body>
          {questions.map((question) => {
            const ticked = !unticked.has(question.id)
            const title = featureTitle(question, bundle?.planting)
            return (
              <Pressable key={question.id} onPress={() => { haptics.select(); toggle(question.id) }}
                accessibilityRole="checkbox" accessibilityState={{ checked: ticked }} accessibilityLabel={title}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.loam100 }]}>
                <Icon name={ticked ? 'ticked' : 'unticked'} size={24} color={ticked ? colors.leaf700 : colors.loam500} />
                <Text style={s.question} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
              </Pressable>
            )
          })}
        </>
      )}

      {sheet && (
        <>
          <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.title')}</Text>
          <View style={s.row}>
            <Icon name="time" size={22} color={colors.prune700} />
            <Text style={s.rowTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.keep')}</Text>
            <Switch value={keepTime} onValueChange={(on) => { haptics.select(); setKeepTime(on) }} trackColor={{ true: colors.prune600 }}
              accessibilityLabel={t('mobile.visit.time.keep')} />
          </View>
          {keepTime && (
            <>
              <View style={s.row} accessible={false}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.duration')}</Text>
                  <Text style={s.meta} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.duration_hint')}</Text>
                </View>
                <IconButton icon="minus" label={t('mobile.visit.time.less')} onPress={() => setMinutes((m) => stepMinutes(m, -1, step))} />
                <Text style={s.duration} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">{duration(minutes)}</Text>
                <IconButton icon="plus" label={t('mobile.visit.time.more')} onPress={() => setMinutes((m) => stepMinutes(m, 1, step))} />
              </View>
              <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.phase')}</Text>
              <View style={s.chips} accessibilityRole="radiogroup">
                {sheet.phases.map((key) => (
                  <Chip key={key} role="radio" label={t(`time_entries.phases.${key}`)} selected={chosenPhase === key} onPress={() => setPhase(key)} />
                ))}
              </View>
              <View style={s.row}>
                <Icon name="car" size={22} color={colors.prune700} />
                <Text style={s.rowTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.trip')}</Text>
                <Switch value={withTrip} onValueChange={(on) => { haptics.select(); setTrip(on) }} trackColor={{ true: colors.prune600 }}
                  accessibilityLabel={t('mobile.visit.time.trip')} />
              </View>
              {withTrip && (
                <>
                  <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.trip_km')}</Text>
                  <Input value={kmText} onChangeText={setKm} keyboardType="decimal-pad" accessibilityLabel={t('mobile.visit.time.trip_km')} />
                  {usual?.from && usual?.to && <Text style={s.meta} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.time.trip_usual', { from: usual.from, to: usual.to })}</Text>}
                </>
              )}
              <Body muted>{sheet.billTo ? t('mobile.visit.time.billable', { bill_to: sheet.billTo }) : t('mobile.visit.time.billable_nobody')}</Body>
            </>
          )}
        </>
      )}

      <Button icon="check" label={t('mobile.visit.close')} onPress={() => void close()} busy={closing} disabled={!visit || closing} style={{ marginTop: space.lg }} />
      <Button variant="ghost" label={t('mobile.visit.keep_going')} onPress={() => router.back()} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  body: { padding: space.lg, gap: space.sm, ...readable },
  section: { ...type.mapName, color: colors.loam900, marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.min, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.loam100 },
  rowTitle: { flex: 1, fontSize: 16, fontFamily: fonts.medium, color: colors.loam900 },
  count: { ...type.label, color: colors.prune700 },
  question: { flex: 1, ...type.body, color: colors.loam900 },
  meta: { ...type.meta, color: colors.loam600 },
  duration: { ...type.label, color: colors.loam900, minWidth: 64, textAlign: 'center' },
  label: { ...type.label, color: colors.loam700, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
