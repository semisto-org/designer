// « Un signe de saison »: what the land shows right now (the first frost,
// where the snow melts first, a puddle after rain, an animal's path, a
// nest…), noted where one stands. First the signs, this month's on top, each
// with what it tells the design; then when it was seen, a few words and
// photos. Goes through the outbox like a note, so it works without network.
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { display } from '@/lib/display'
import { gpsProperties } from '@/lib/geo'
import { haptics } from '@/lib/haptics'
import { formatDistance, t } from '@/lib/i18n'
import { currentPosition, currentPositionWithAccuracy } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import { SEASON_SIGN, SIGN_GROUPS, isSign, observedOn, signFeature, signLabel, signsOf, signsOfMonth, type Sign } from '@/lib/season'
import type { Position } from '@/lib/types'
import { useMapBundle } from '@/state/useMapBundle'
import { chooseMedia, type MediaChoice } from '@/ui/chooseMedia'
import { Icon } from '@/ui/Icon'
import { Body, Button, Chip, Input, Label, MAX_FONT_SCALE, Notice } from '@/ui/kit'
import { toast } from '@/ui/Toast'
import { colors, fonts, radius, space, touch, type } from '@/ui/theme'

const DAYS = [{ key: 'today', ago: 0 }, { key: 'yesterday', ago: 1 }, { key: 'two_days', ago: 2 }] as const

export default function SeasonSign() {
  const params = useLocalSearchParams<{ id: string; sign?: string }>()
  const mapId = Number(params.id)
  const [sign, setSign] = useState<Sign | null>(isSign(params.sign) ? params.sign : null)
  const insets = useSafeAreaInsets()

  return sign
    ? <SignForm mapId={mapId} sign={sign} onBack={isSign(params.sign) ? undefined : () => setSign(null)} bottom={insets.bottom} />
    : <SignChooser onChoose={setSign} bottom={insets.bottom} />
}

function SignChooser({ onChoose, bottom }: { onChoose: (sign: Sign) => void; bottom: number }) {
  const month = signsOfMonth()
  const choose = (sign: Sign) => { haptics.tap(); onChoose(sign) }
  return (
    <ScrollView style={s.fill} contentContainerStyle={[s.body, { paddingBottom: bottom + space.xl }]}>
      <Body muted>{t('mobile.season.intro')}</Body>
      <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.season.this_month')}</Text>
      {month.map((sign) => (
        <Pressable key={sign} onPress={() => choose(sign)} accessibilityRole="button" accessibilityLabel={signLabel(sign)} accessibilityHint={t(`mobile.season.hints.${sign}`)}
          style={({ pressed }) => [s.monthRow, pressed && { backgroundColor: colors.loam100 }]}>
          <Text style={s.rowTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{signLabel(sign)}</Text>
          <Text style={s.meta} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t(`mobile.season.hints.${sign}`)}</Text>
        </Pressable>
      ))}
      {SIGN_GROUPS.map((group) => (
        <View key={group} style={{ gap: space.sm }}>
          <View style={s.groupTitle}>
            <Icon name={group} size={22} color={colors.prune700} />
            <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t(`mobile.season.groups.${group}`)}</Text>
          </View>
          <View style={s.chips}>
            {signsOf(group).map((sign) => <Chip key={sign} label={signLabel(sign)} selected={false} onPress={() => choose(sign)} />)}
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

function SignForm({ mapId, sign, onBack, bottom }: { mapId: number; sign: Sign; onBack?: () => void; bottom: number }) {
  const { bundle } = useMapBundle(mapId)
  const [ago, setAgo] = useState(0)
  const [text, setText] = useState('')
  const [media, setMedia] = useState<MediaChoice['items']>([])
  const [fix, setFix] = useState<{ position: Position; accuracy: number | null } | null | 'pending'>('pending')

  // Where the person stands when the sign opens: that is where they see it.
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
    if (!bundle) return
    // Still looking for a precise fix: the last known position will do.
    const found = fix === 'pending' ? await currentPosition() : fix?.position ?? null
    const position = found ?? bundle.map.center ?? null
    if (!position) return
    const accuracy = fix && fix !== 'pending' ? gpsProperties(fix.accuracy) : {}
    const tempId = outbox.addFeature(mapId, signFeature({ sign, label: signLabel(sign), text, position, observedAt: observedOn(ago), accuracy }))
    for (const item of media) {
      outbox.add({
        type: 'uploadPhoto', mapId, file: item.file, takenAt: item.takenAt,
        lng: item.position?.[0] ?? position[0], lat: item.position?.[1] ?? position[1], featureId: tempId, heading: item.heading ?? null,
      })
    }
    display.reveal(mapId, { layer: 'notes', kind: SEASON_SIGN }, undefined)
    haptics.success()
    toast(t('mobile.season.saved'), { body: signLabel(sign) })
    router.back()
  }

  const located = fix && fix !== 'pending'
  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={s.titleRow}>
          <Icon name="season" size={28} color={colors.prune700} />
          <Text accessibilityRole="header" style={s.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{signLabel(sign)}</Text>
        </View>
        <Text style={s.hand} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t(`mobile.season.hints.${sign}`)}</Text>

        <Label>{t('mobile.season.when')}</Label>
        <View style={s.chips}>
          {DAYS.map((day) => <Chip key={day.key} label={t(`mobile.season.days.${day.key}`)} selected={ago === day.ago} onPress={() => setAgo(day.ago)} />)}
        </View>

        <Label>{t('mobile.season.text_label')}</Label>
        <Input value={text} onChangeText={setText} placeholder={t('mobile.season.placeholder')} multiline accessibilityLabel={t('mobile.season.text_label')} />

        <Button variant="secondary" icon="photo" label={t('mobile.season.add_photo')} onPress={() => void addMedia()} />
        {media.length > 0 && <Body muted>{t('mobile.season.photos', { count: media.length })}</Body>}

        {fix === 'pending' ? <Body muted>{t('mobile.terrain.around_locating')}</Body>
          : located ? <Body muted>{t('mobile.season.position', { accuracy: formatDistance(fix.accuracy ?? 10) })}</Body>
            : <Notice tone="warning">{t('mobile.season.no_position')}</Notice>}

        <Button icon="check" label={t('mobile.season.save')} onPress={() => void save()} disabled={!bundle} />
        {onBack && <Button variant="ghost" label={t('mobile.common.back')} onPress={onBack} />}
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
  section: { ...type.mapName, color: colors.loam900 },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  monthRow: {
    gap: 2, minHeight: touch.field, padding: space.md, borderRadius: radius.lg,
    backgroundColor: colors.loam50, borderWidth: 1, borderColor: colors.loam200,
  },
  rowTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.loam900 },
  meta: { ...type.meta, color: colors.loam600 },
})
