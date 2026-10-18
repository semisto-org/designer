// One note of a site visit: what the person sees where they stand, under the
// theme they touched (water, soil, a tree already there…), with a few words
// and photos if they want. It is placed at the blue dot and goes through the
// outbox, so it works without network; the visit's report groups the notes
// by theme.
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { display } from '@/lib/display'
import { formatDistance, t } from '@/lib/i18n'
import { currentPosition, currentPositionWithAccuracy } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import type { Position } from '@/lib/types'
import { useVisit } from '@/lib/visit'
import { isTheme, noteFeature } from '@/lib/visit-core'
import { useMapBundle } from '@/state/useMapBundle'
import { chooseMedia, type MediaChoice } from '@/ui/chooseMedia'
import { Icon } from '@/ui/Icon'
import { Body, Button, Input, Label, MAX_FONT_SCALE, Notice } from '@/ui/kit'
import { toast } from '@/ui/Toast'
import { colors, space, type } from '@/ui/theme'

export default function VisitNote() {
  const params = useLocalSearchParams<{ id: string; theme?: string }>()
  const mapId = Number(params.id)
  const theme = isTheme(params.theme) ? params.theme : null
  const { bundle } = useMapBundle(mapId)
  const visit = useVisit(mapId)
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [media, setMedia] = useState<MediaChoice['items']>([])
  const [fix, setFix] = useState<{ position: Position; accuracy: number | null } | null | 'pending'>('pending')
  const [problem, setProblem] = useState<string | null>(null)

  // Where the person stands when the note opens: that is where they looked.
  useEffect(() => {
    let gone = false
    currentPositionWithAccuracy().then((found) => { if (!gone) setFix(found) })
    return () => { gone = true }
  }, [])

  const addMedia = async () => {
    const choice = await chooseMedia()
    if (choice) setMedia((all) => [...all, ...choice.items])
  }

  const save = async () => {
    if (!visit || !bundle) return
    if (!text.trim() && media.length === 0) { setProblem(t('mobile.visit.empty')); return }
    // Still looking for a precise fix: the last known position will do.
    const found = fix === 'pending' ? await currentPosition() : fix?.position ?? null
    const position = found ?? bundle.map.center ?? null
    if (!position) return
    const feature = noteFeature(text, theme, visit, position)
    const tempId = outbox.addFeature(mapId, feature)
    for (const item of media) {
      outbox.add({
        type: 'uploadPhoto', mapId, file: item.file, takenAt: item.takenAt,
        lng: item.position?.[0] ?? position[0], lat: item.position?.[1] ?? position[1], featureId: tempId,
      })
    }
    display.reveal(mapId, { layer: 'notes', kind: 'note_point' }, undefined)
    toast(t('mobile.visit.saved'), { body: t(`mobile.visit.themes.${theme ?? 'other'}`) })
    router.back()
  }

  const located = fix && fix !== 'pending'
  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={s.titleRow}>
          <Icon name={theme ?? 'other'} size={28} color={colors.prune700} />
          <Text accessibilityRole="header" style={s.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t(`mobile.visit.themes.${theme ?? 'other'}`)}</Text>
        </View>
        <Text style={s.hand} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t(`mobile.visit.hints.${theme ?? 'other'}`)}</Text>

        <Label>{t('mobile.visit.text_label')}</Label>
        <Input value={text} onChangeText={(value) => { setText(value); setProblem(null) }} placeholder={t('mobile.visit.placeholder')}
          multiline autoFocus accessibilityLabel={t('mobile.visit.text_label')} />

        <Button variant="secondary" icon="photo" label={t('mobile.visit.add_photo')} onPress={() => void addMedia()} />
        {media.length > 0 && <Body muted>{t('mobile.visit.photos', { count: media.length })}</Body>}

        {fix === 'pending' ? <Body muted>{t('mobile.terrain.around_locating')}</Body>
          : located ? <Body muted>{t('mobile.visit.position', { accuracy: formatDistance(fix.accuracy ?? 10) })}</Body>
            : <Notice tone="warning">{t('mobile.visit.no_position')}</Notice>}
        {problem && <Notice tone="error">{problem}</Notice>}

        <Button icon="check" label={t('mobile.visit.save')} onPress={() => void save()} disabled={!visit || !bundle} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  body: { padding: space.lg, gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...type.title, color: colors.loam900, flex: 1 },
  hand: { ...type.hand, color: colors.prune700 },
})
