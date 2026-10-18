// The end of a site visit: what was noted, theme by theme, and the open
// questions, ticked to become tasks about their note. Closing sends the
// visit through the outbox; the server files its report in the map's
// documents (SiteVisit), grouped like this screen.
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { featureTitle } from '@/lib/elements'
import { haptics } from '@/lib/haptics'
import { t } from '@/lib/i18n'
import { visits, useVisit } from '@/lib/visit'
import { countByTheme, questionsOf, visitNotes } from '@/lib/visit-core'
import { useMapBundle } from '@/state/useMapBundle'
import { Icon } from '@/ui/Icon'
import { Body, Button, MAX_FONT_SCALE } from '@/ui/kit'
import { toast } from '@/ui/Toast'
import { colors, fonts, space, touch, type } from '@/ui/theme'

export default function VisitEnd() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle } = useMapBundle(mapId)
  const visit = useVisit(mapId)
  const insets = useSafeAreaInsets()
  const notes = useMemo(() => (bundle && visit ? visitNotes(bundle, visit.key) : []), [bundle, visit])
  const questions = questionsOf(notes)
  const [unticked, setUnticked] = useState<Set<number>>(new Set())

  const toggle = (id: number) => setUnticked((all) => {
    const next = new Set(all)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const close = () => {
    visits.close(mapId, questions.map((q) => q.id).filter((id) => !unticked.has(id)))
    haptics.success()
    toast(t('mobile.visit.closed_title'), { body: t('mobile.visit.closed') })
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

      <Button icon="check" label={t('mobile.visit.close')} onPress={close} disabled={!visit} style={{ marginTop: space.lg }} />
      <Button variant="ghost" label={t('mobile.visit.keep_going')} onPress={() => router.back()} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  body: { padding: space.lg, gap: space.sm },
  section: { ...type.mapName, color: colors.loam900, marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.min, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.loam100 },
  rowTitle: { flex: 1, fontSize: 16, fontFamily: fonts.medium, color: colors.loam900 },
  count: { ...type.label, color: colors.prune700 },
  question: { flex: 1, ...type.body, color: colors.loam900 },
})
