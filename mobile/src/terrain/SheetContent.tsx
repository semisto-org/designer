// What the terrain sheet holds: at rest, today on this place and what grows
// around the person; with « Noter ici », what one can note; with a feature
// chosen, that feature with its age, where it stands and the gestures it asks.
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native'
import { featureColor, featureTitle, kindLabel, speciesName } from '@/lib/elements'
import { formatDay, formatDistance, formatTime, seasonOf, t } from '@/lib/i18n'
import { haptics } from '@/lib/haptics'
import { ageLabel, monthCard, plantedAge, type Direction, type Nearby } from '@/lib/terrain'
import { THEMES, minutesSince, themeOf, type Theme, type Visit } from '@/lib/visit-core'
import type { MapFeature, Photo, Planting } from '@/lib/types'
import { Icon, type IconName } from '@/ui/Icon'
import { Body, Button, IconButton, MAX_FONT_SCALE } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { colors, fonts, radius, space, touch, type } from '@/ui/theme'

export const AROUND_RADIUS = 30

/** « à 12 m au nord-est », written out for the screen reader too. */
export function whereLabel(meters: number, direction: Direction): string {
  return t('mobile.terrain.distance', { distance: formatDistance(meters), direction: t(`mobile.terrain.directions.${direction}`) })
}

/** One line about a feature: its age or « À planter » for a plant, else its kind. */
export function featureLine(feature: MapFeature, planting: Planting | undefined): string {
  const isPlant = feature.properties.kind === 'plant'
  if (!isPlant) return feature.properties.name ? kindLabel(feature.properties.kind) : ''
  // In the ground since a date nobody knows: no age to tell.
  const unknown = !!feature.properties.planted_on && feature.properties.planted_on_precision === 'unknown'
  const age = unknown ? null : plantedAge(feature.properties.planted_on)
  return [
    unknown ? t('plant_feature.planted_unknown') : age ? ageLabel(age) : t('mobile.feature.to_plant'),
    feature.properties.name ? speciesName(planting, feature.properties.species_id) : null,
  ].filter(Boolean).join(' · ')
}

// ── At rest ────────────────────────────────────────────────────────────

export function RestTop({ editable, onNote, onVisit }: { editable: boolean; onNote: () => void; onVisit?: () => void }) {
  const card = monthCard()
  return (
    <View style={s.top}>
      <Text style={s.hand} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {t('mobile.terrain.today', { season: t(`mobile.terrain.seasons.${seasonOf()}`), date: formatDay() })}
      </Text>
      {card && <Text accessibilityRole="header" style={s.monthTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{card.title}</Text>}
      {editable && (
        <View style={s.gestures}>
          <Button icon="note" label={t('mobile.terrain.note_here')} onPress={onNote} style={s.gesture} />
          {onVisit && <Button variant="secondary" icon="visit" label={t('mobile.visit.start')} onPress={onVisit} style={s.gesture} />}
        </View>
      )}
    </View>
  )
}

export function RestBody({ around, located, planting, onPick, viewer }: {
  around: Nearby[]; located: 'yes' | 'pending' | 'denied'; planting: Planting | undefined; onPick: (feature: MapFeature) => void; viewer: boolean
}) {
  const card = monthCard()
  return (
    <View style={s.body}>
      {card && <Body muted>{card.body}</Body>}
      {viewer && <Body muted>{t('mobile.terrain.viewer')}</Body>}
      <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.terrain.around')}</Text>
      {located === 'pending' && <Body muted>{t('mobile.terrain.around_locating')}</Body>}
      {located === 'denied' && <Body muted>{t('mobile.terrain.around_no_position')}</Body>}
      {located === 'yes' && around.length === 0 && <Body muted>{t('mobile.terrain.around_none', { distance: formatDistance(AROUND_RADIUS) })}</Body>}
      {located === 'yes' && around.length > 0 && <Body muted>{t('mobile.terrain.around_hint', { distance: formatDistance(AROUND_RADIUS) })}</Body>}
      {around.map((item) => <AroundRow key={item.feature.id} item={item} planting={planting} onPress={() => onPick(item.feature)} />)}
    </View>
  )
}

function AroundRow({ item, planting, onPress }: { item: Nearby; planting: Planting | undefined; onPress: () => void }) {
  const title = featureTitle(item.feature, planting)
  const line = featureLine(item.feature, planting)
  const where = whereLabel(item.meters, item.direction)
  return (
    <Pressable onPress={() => { haptics.tap(); onPress() }} accessibilityRole="button" accessibilityLabel={[title, line, where].filter(Boolean).join(', ')}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.loam100 }]}>
      <View style={[s.dot, { backgroundColor: featureColor(item.feature) }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
        {line ? <Text style={s.meta} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{line}</Text> : null}
      </View>
      <Text style={s.distance} maxFontSizeMultiplier={1.3}>{formatDistance(item.meters)} {item.direction}</Text>
    </Pressable>
  )
}

// ── « Noter ici » ──────────────────────────────────────────────────────

export type NoteChoice = 'photo' | 'plant' | 'record' | 'identify' | 'storm'
const NOTES: { choice: NoteChoice; icon: IconName; label: string }[] = [
  { choice: 'photo', icon: 'photo', label: 'mobile.actions.photo' },
  { choice: 'plant', icon: 'plant', label: 'mobile.actions.plant' },
  { choice: 'record', icon: 'point', label: 'mobile.actions.record' },
  { choice: 'identify', icon: 'identify', label: 'mobile.actions.identify' },
  { choice: 'storm', icon: 'storm', label: 'mobile.actions.storm' },
]

export function NoteTop({ onChoose, onClose }: { onChoose: (choice: NoteChoice) => void; onClose: () => void }) {
  return (
    <View style={s.top}>
      <View style={s.titleRow}>
        <Text accessibilityRole="header" style={[s.monthTitle, { flex: 1 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.terrain.note_title')}</Text>
        <IconButton icon="close" label={t('mobile.common.close')} onPress={onClose} size={touch.min} />
      </View>
      <View style={s.tiles}>
        {NOTES.map((note) => (
          <Pressable key={note.choice} onPress={() => { haptics.tap(); onChoose(note.choice) }} accessibilityRole="button" accessibilityLabel={t(note.label)}
            style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.97 }] }]}>
            <Icon name={note.icon} size={26} color={colors.prune700} />
            <Text style={s.tileLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>{t(note.label)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

// ── A site visit ───────────────────────────────────────────────────────

/** The visit under way: since when, how many notes, a tile per theme and « Terminer ». */
export function VisitTop({ visit, count, onTheme, onEnd }: { visit: Visit; count: number; onTheme: (theme: Theme | null) => void; onEnd: () => void }) {
  const minutes = minutesSince(visit.startedAt)
  return (
    <View style={s.top}>
      <View style={s.titleRow}>
        <View style={{ flex: 1 }} accessible>
          <Text style={s.hand} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {t('mobile.visit.under_way', { time: formatTime(visit.startedAt) })} · {t('mobile.visit.lasted', { count: minutes })}
          </Text>
          <Text accessibilityRole="header" style={s.monthTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.what')}</Text>
        </View>
      </View>
      <View style={s.tiles}>
        {[...THEMES, null].map((theme) => (
          <Pressable key={theme ?? 'other'} onPress={() => { haptics.tap(); onTheme(theme) }} accessibilityRole="button"
            accessibilityLabel={theme ? t(`mobile.visit.themes.${theme}`) : t('mobile.visit.free_note')}
            accessibilityHint={t(`mobile.visit.hints.${theme ?? 'other'}`)}
            style={({ pressed }) => [s.tile, s.themeTile, pressed && { transform: [{ scale: 0.97 }] }]}>
            <Icon name={theme ?? 'other'} size={24} color={theme === 'question' ? colors.humus700 : colors.prune700} />
            <Text style={s.tileLabel} numberOfLines={2} maxFontSizeMultiplier={1.3}>{theme ? t(`mobile.visit.themes.${theme}`) : t('mobile.visit.free_note')}</Text>
          </Pressable>
        ))}
      </View>
      <Button variant="secondary" icon="check" label={`${t('mobile.visit.end')} · ${t('mobile.visit.notes', { count })}`} onPress={onEnd} style={{ marginTop: space.sm }} />
    </View>
  )
}

/** The visit's notes so far, the last one first: each one opens on the map. */
export function VisitBody({ notes, planting, onPick }: { notes: MapFeature[]; planting: Planting | undefined; onPick: (feature: MapFeature) => void }) {
  return (
    <View style={s.body}>
      <Text accessibilityRole="header" style={s.section} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.visit.notes_title')}</Text>
      {notes.length === 0 && <Body muted>{t('mobile.visit.none_yet')}</Body>}
      {notes.slice().reverse().map((note) => {
        const theme = themeOf(note) ?? 'other'
        const title = featureTitle(note, planting)
        const time = typeof note.properties.taken_at === 'string' ? formatTime(note.properties.taken_at) : ''
        return (
          <Pressable key={note.id} onPress={() => { haptics.tap(); onPick(note) }} accessibilityRole="button"
            accessibilityLabel={[t(`mobile.visit.themes.${theme}`), title, time].filter(Boolean).join(', ')}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.loam100 }]}>
            <Icon name={theme} size={22} color={theme === 'question' ? colors.humus700 : colors.prune700} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
              <Text style={s.meta} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{[t(`mobile.visit.themes.${theme}`), time].filter(Boolean).join(' · ')}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

// ── A feature ──────────────────────────────────────────────────────────

export type QuickAction = { key: string; icon: IconName; label: string; onPress: () => void; primary?: boolean }

export function FeatureTop({ mapId, feature, planting, photo, where, gestures, onClose }: {
  mapId: number; feature: MapFeature; planting: Planting | undefined; photo: Photo | null
  where: string | null; gestures: QuickAction[]; onClose: () => void
}) {
  const title = featureTitle(feature, planting)
  const line = [featureLine(feature, planting), where].filter(Boolean).join(' · ')
  return (
    <View style={s.top}>
      <View style={s.titleRow}>
        {photo
          ? <RemoteImage path={`/maps/${mapId}/photos/${photo.id}/image?size=thumb`} style={s.photo} />
          : <View style={[s.photo, s.photoEmpty]}><View style={[s.bigDot, { backgroundColor: featureColor(feature) }]} /></View>}
        <View style={{ flex: 1 }} accessible accessibilityLabel={[title, line].filter(Boolean).join(', ')}>
          <Text accessibilityRole="header" style={s.featureTitle} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
          {line ? <Text style={s.meta} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>{line}</Text> : null}
        </View>
        <IconButton icon="close" label={t('mobile.common.close')} onPress={onClose} size={touch.min} />
      </View>
      {gestures.length > 0 && (
        <View style={s.gestures}>
          {gestures.map((g) => <Button key={g.key} icon={g.icon} label={g.label} variant={g.primary ? 'primary' : 'secondary'} onPress={g.onPress} style={s.gesture} />)}
        </View>
      )}
    </View>
  )
}

export function FeatureBody({ mapId, feature, photos, onOpen }: { mapId: number; feature: MapFeature; photos: Photo[]; onOpen: () => void }) {
  return (
    <View style={s.body}>
      {feature.properties.notes ? <Text style={s.notes} maxFontSizeMultiplier={MAX_FONT_SCALE}>{feature.properties.notes}</Text> : null}
      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {photos.slice(0, 8).map((photo) => <RemoteImage key={photo.id} path={`/maps/${mapId}/photos/${photo.id}/image?size=thumb`} style={s.strip} />)}
        </ScrollView>
      )}
      <Button variant="ghost" icon="sheet" label={t('mobile.terrain.open_full')} onPress={onOpen} />
    </View>
  )
}

const s = StyleSheet.create({
  top: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: 2 },
  body: { paddingHorizontal: space.lg, gap: space.sm },
  hand: { ...type.hand, color: colors.prune700 },
  monthTitle: { ...type.mapName, color: colors.loam900 },
  section: { ...type.mapName, color: colors.loam900, marginTop: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.field, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.loam100 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.white },
  rowTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.loam900 },
  meta: { ...type.meta, color: colors.loam500 },
  distance: { ...type.label, color: colors.prune700 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  tile: {
    flexGrow: 1, flexBasis: '30%', minHeight: 76, borderRadius: radius.lg, backgroundColor: colors.loam50, borderWidth: 1, borderColor: colors.loam200,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  tileLabel: { ...type.label, color: colors.loam800, textAlign: 'center' },
  themeTile: { flexBasis: '22%', minHeight: 72, paddingHorizontal: 4 },
  photo: { width: 64, height: 64, borderRadius: radius.md },
  photoEmpty: { backgroundColor: colors.loam100, alignItems: 'center', justifyContent: 'center' },
  bigDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: colors.white },
  featureTitle: { ...type.mapName, color: colors.loam900 },
  gestures: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  gesture: { flexGrow: 1 },
  notes: { ...type.hand, fontSize: 22, lineHeight: 27, color: colors.loam800 },
  strip: { width: 112, height: 112, borderRadius: radius.md },
})
