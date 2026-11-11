// « Discussion de la carte » on the phone: the map's live discussion, over
// the terrain. Swiped down, it only hides: the connection stays open and
// the messages loaded (lib/chat.ts), so it comes back at once.
//
// On the terrain, a message points at the place: « Ici » pins it where one
// stands (GPS), the camera joins a photo taken there, « # » cites an
// element (those around oneself first), « @ » calls someone. A pin or a
// cited element, tapped, shows it on the map.
import * as Linking from 'expo-linking'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { chat, useChat } from '@/lib/chat'
import {
  chatFeatureLabel, citedIds, continues, documentPath, fileSize, insertToken, matchCitables, matchMembers, showsAsPicture, tokenizeChat, typedQuery,
  type Citable, type ChatDocument, type ChatMember, type ChatMessage,
} from '@/lib/chat-core'
import { kindLabel } from '@/lib/elements'
import { anchor, bearing, distance } from '@/lib/geo'
import { openDocument } from '@/lib/documents'
import { haptics } from '@/lib/haptics'
import { formatDate, formatTime, t } from '@/lib/i18n'
import { currentHeading, currentPositionWithAccuracy } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import type { Op } from '@/lib/outbox-core'
import { takePhoto } from '@/lib/photos'
import { compass } from '@/lib/terrain'
import { canEdit, type Position } from '@/lib/types'
import { useMapBundle } from '@/state/useMapBundle'
import { useOnline, useOutbox } from '@/state/sync'
import { whereLabel } from '@/terrain/SheetContent'
import { Icon, type IconName } from '@/ui/Icon'
import { KeyboardAvoid } from '@/ui/KeyboardAvoid'
import { Body, Button, IconButton, MAX_FONT_SCALE, Notice } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { colors, fonts, radius, shadows, space, touch, type } from '@/ui/theme'

type Pending = Extract<Op, { type: 'chatMessage' }>
type Pin = { position: Position; accuracy: number | null }
type Shot = { file: string; position: Position | null; takenAt: string; heading: number | null }

export default function ChatScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle } = useMapBundle(mapId)
  const state = useChat()
  const online = useOnline()
  const insets = useSafeAreaInsets()
  const pending = useOutbox().ops.filter((op): op is Pending => op.type === 'chatMessage' && op.mapId === mapId)
  const [me, setMe] = useState<Position | null>(null)
  const list = useRef<FlatList<Row>>(null)
  const [highlight, setHighlight] = useState<number | null>(null)

  // Shown while this screen is in front; hidden (not closed) when it goes.
  useFocusEffect(useCallback(() => {
    chat.show(mapId)
    return () => chat.hide()
  }, [mapId]))

  // Where one stands, for « à 12 m au nord » under each pin.
  useEffect(() => {
    let gone = false
    void currentPositionWithAccuracy().then((fix) => { if (!gone && fix) setMe(fix.position) })
    return () => { gone = true }
  }, [])

  const handles = useMemo(() => state.members.map((m) => m.handle), [state.members])
  // Newest first, for an inverted list: the latest message sits above the composer.
  const rows = useMemo<Row[]>(() => {
    const sent: Row[] = state.messages.map((message, index) => ({ key: `m${message.id}`, message, previous: state.messages[index - 1] }))
    const waiting: Row[] = pending.map((op) => ({ key: op.id, op }))
    return [...sent, ...waiting].reverse()
  }, [state.messages, pending])

  // A pin tapped on the map: that message, in view and marked.
  useEffect(() => {
    if (!state.focusId || state.status !== 'ready') return
    const index = rows.findIndex((row) => 'message' in row && row.message.id === state.focusId)
    if (index >= 0) {
      setHighlight(state.focusId)
      setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 250)
    }
    chat.clearFocus()
  }, [state.focusId, state.status, rows])

  const showOnMap = (focus: Parameters<typeof chat.focusMap>[0]) => {
    chat.focusMap(focus)
    router.back()
  }

  const remove = (message: ChatMessage) => {
    Alert.alert(t('mobile.chat.delete_title'), t('mobile.chat.delete_body'), [
      { text: t('mobile.common.cancel'), style: 'cancel' },
      {
        text: t('mobile.chat.delete'), style: 'destructive',
        onPress: () => { void chat.remove(mapId, message.id).catch(() => Alert.alert(t('mobile.chat.delete_failed'))) },
      },
    ])
  }

  const editable = !!bundle && canEdit(bundle.map)
  const closed = state.status === 'closed' || (bundle && bundle.map.chat === false)

  return (
    <KeyboardAvoid style={s.screen} reserved={Math.max(0, insets.bottom - space.sm)}>
      <View style={[s.header, { paddingTop: Platform.OS === 'android' ? insets.top + space.sm : space.md }]}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={s.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.chat.title')}</Text>
          <View style={s.headerLine}>
            <View style={[s.liveDot, { backgroundColor: state.live && online ? colors.leaf500 : colors.loam300 }]} />
            <Text style={s.meta} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {[bundle?.map.name, state.live && online ? t('mobile.chat.live') : t('mobile.chat.not_live')].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <IconButton icon="hide" label={t('mobile.chat.hide')} onPress={() => router.back()} />
      </View>

      {closed ? (
        <View style={s.center}><Body muted>{t('mobile.chat.closed')}</Body></View>
      ) : state.status === 'loading' || state.status === 'idle' ? (
        <View style={s.center}><ActivityIndicator color={colors.prune600} /></View>
      ) : state.status === 'failed' ? (
        <View style={[s.center, { gap: space.md }]}>
          <Body muted>{online ? t('mobile.chat.failed') : t('mobile.chat.offline')}</Body>
          {online && <Button variant="secondary" label={t('mobile.chat.retry')} onPress={() => chat.reload(mapId)} />}
        </View>
      ) : (
        <FlatList
          ref={list}
          inverted
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={s.list}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={() => undefined}
          ListFooterComponent={rows.length === 0 ? null : <Text style={s.hint} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.chat.beginning')}</Text>}
          ListEmptyComponent={<EmptyChat />}
          renderItem={({ item }) => 'message' in item
            ? <MessageRow mapId={mapId} message={item.message} previous={item.previous} handles={handles} me={me} highlighted={item.message.id === highlight}
                onFeature={(id) => showOnMap({ kind: 'feature', id })}
                onSpot={(position) => showOnMap({ kind: 'spot', position, messageId: item.message.id })}
                onPhoto={(photoId) => router.push({ pathname: '/maps/[id]/photo/[photoId]', params: { id: String(mapId), photoId: String(photoId) } })}
                onDocument={(document) => showsAsPicture(document)
                  ? router.push({ pathname: '/maps/[id]/document/[documentId]', params: { id: String(mapId), documentId: String(document.id), title: document.title } })
                  : void openDocument(mapId, document.id).catch(() => Alert.alert(t(online ? 'mobile.chat.document_failed' : 'mobile.chat.document_offline')))}
                onLongPress={item.message.canDelete ? () => remove(item.message) : undefined} />
            : <PendingRow op={item.op} online={online} />}
        />
      )}

      {!closed && state.status === 'ready' && bundle && (
        <Composer mapId={mapId} members={state.members} me={me} canPhoto={editable}
          citables={bundle.features.filter((f) => f.properties.status !== 'rejected').map((f) => ({
            id: f.id, layer: f.properties.layer, label: chatFeatureLabel(f.properties, kindLabel(f.properties.kind)),
            meters: me ? distance(me, anchor(f.geometry)) : null,
          }))}
          bottomInset={insets.bottom} onMe={setMe} />
      )}
    </KeyboardAvoid>
  )
}

type Row = { key: string; message: ChatMessage; previous?: ChatMessage } | { key: string; op: Pending }

function EmptyChat() {
  // The inverted list turns its empty view upside down too.
  return (
    <View style={[s.empty, { transform: [{ scaleY: -1 }] }]}>
      <Text style={s.hand} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.chat.empty_title')}</Text>
      <Body muted>{t('mobile.chat.empty_body')}</Body>
    </View>
  )
}

function MessageRow({ mapId, message, previous, handles, me, highlighted, onFeature, onSpot, onPhoto, onDocument, onLongPress }: {
  mapId: number; message: ChatMessage; previous?: ChatMessage; handles: string[]; me: Position | null; highlighted: boolean
  onFeature: (id: number) => void; onSpot: (position: Position) => void; onPhoto: (photoId: number) => void
  onDocument: (document: ChatDocument) => void; onLongPress?: () => void
}) {
  const same = continues(previous, message)
  const newDay = !previous || previous.createdAt.slice(0, 10) !== message.createdAt.slice(0, 10)
  const features = message.features ?? []
  const tokens = tokenizeChat(message.body, handles, features)
  const where = message.location
    ? me
      ? (() => {
          const meters = distance(me, message.location)
          return meters < 8 ? t('mobile.chat.pinned_here') : whereLabel(meters, compass(bearing(me, message.location)))
        })()
      : t('mobile.chat.pinned')
    : null
  return (
    <View>
      {newDay && <Text style={s.day} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatDate(message.createdAt)}</Text>}
      <Pressable onLongPress={onLongPress} delayLongPress={400}
        accessibilityHint={onLongPress ? t('mobile.chat.delete_hint') : undefined}
        style={[s.message, message.canEdit && s.mine, highlighted && s.highlighted, same && !newDay && { marginTop: -space.sm + 2 }]}>
        {(!same || newDay) && (
          <Text style={s.author} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {message.canEdit ? t('mobile.chat.you') : message.author.name}
            <Text style={s.time}>  {formatTime(message.createdAt)}{message.editedAt ? ` · ${t('mobile.chat.edited')}` : ''}</Text>
          </Text>
        )}
        <Text style={s.body} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {tokens.map((token, i) => {
            if (token.kind === 'mention') return <Text key={i} style={s.mention}>{token.value}</Text>
            if (token.kind === 'feature' && token.id) return <Text key={i} style={s.cited} onPress={() => onFeature(token.id)} accessibilityRole="link">{token.value}</Text>
            if (token.kind === 'link') return <Text key={i} style={s.link} onPress={() => void Linking.openURL(token.value)} accessibilityRole="link">{token.value}</Text>
            return <Text key={i}>{token.value}</Text>
          })}
        </Text>
        {message.photo && (
          <Pressable onPress={() => onPhoto(message.photo!.id)} accessibilityRole="imagebutton" accessibilityLabel={message.photo.caption ?? t('mobile.chat.photo')}>
            <RemoteImage path={`/maps/${mapId}/photos/${message.photo.id}/image?size=thumb`} style={s.photo} />
            {message.photo.video && <View style={s.play} pointerEvents="none"><Text style={s.playMark}>▶</Text></View>}
          </Pressable>
        )}
        {message.document && <DocumentAttachment mapId={mapId} document={message.document} onPress={() => onDocument(message.document!)} />}
        {(where || features.some((f) => !tokens.some((tk) => tk.kind === 'feature' && tk.id === f.id))) && (
          <View style={s.chips}>
            {where && message.location && <PointChip icon="point" label={where} onPress={() => onSpot(message.location!)} />}
            {features.filter((f) => !tokens.some((tk) => tk.kind === 'feature' && tk.id === f.id)).map((f) => (
              <PointChip key={f.id} icon="plant" label={f.name} onPress={() => onFeature(f.id)} />
            ))}
          </View>
        )}
        {message.applause.count > 0 && (
          <Text style={s.time} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.chat.applause', { count: message.applause.count })}</Text>
        )}
      </Pressable>
    </View>
  )
}

/**
 * A file joined on the website: a picture shows as itself (tap to read it
 * in full), anything else as a card with its name and weight that opens it.
 */
function DocumentAttachment({ mapId, document, onPress }: { mapId: number; document: ChatDocument; onPress: () => void }) {
  if (showsAsPicture(document)) {
    return (
      <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={`${document.title}, ${t('mobile.chat.document_view')}`}>
        <RemoteImage path={documentPath(mapId, document.id, 'thumb')} style={s.photo} />
      </Pressable>
    )
  }
  const size = fileSize(document.byteSize)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${document.title}, ${t('mobile.chat.document_open')}`}
      style={({ pressed }) => [s.file, pressed && { opacity: 0.8 }]}>
      <Icon name="document" size={24} color={colors.prune700} />
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>{document.filename || document.title}</Text>
        {size && <Text style={s.time} maxFontSizeMultiplier={MAX_FONT_SCALE}>{size}</Text>}
      </View>
    </Pressable>
  )
}

function PendingRow({ op, online }: { op: Pending; online: boolean }) {
  return (
    <View style={[s.message, s.mine, s.waiting]}>
      <Text style={s.author} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {t('mobile.chat.you')}
        <Text style={s.time}>  {op.error ? t('mobile.chat.refused') : online ? t('mobile.chat.sending') : t('mobile.chat.waiting')}</Text>
      </Text>
      <Text style={s.body} maxFontSizeMultiplier={MAX_FONT_SCALE}>{op.body}</Text>
      {op.photo && <RemoteImage local={op.photo} style={s.photo} />}
      {op.lng !== null && <View style={s.chips}><PointChip icon="point" label={t('mobile.chat.pinned')} /></View>}
      {op.error && (
        <View style={[s.chips, { marginTop: space.xs }]}>
          <Button variant="secondary" label={t('mobile.outbox.retry')} onPress={() => outbox.retry(op.id)} />
          <Button variant="danger" label={t('mobile.outbox.discard')} onPress={() => outbox.discard(op.id)} />
        </View>
      )}
    </View>
  )
}

function PointChip({ icon, label, onPress, active, onRemove }: { icon: IconName; label: string; onPress?: () => void; active?: boolean; onRemove?: () => void }) {
  return (
    <Pressable onPress={onRemove ?? onPress} disabled={!onPress && !onRemove} accessibilityRole="button"
      accessibilityLabel={onRemove ? `${label}, ${t('mobile.chat.remove')}` : label}
      style={({ pressed }) => [s.chip, active && s.chipActive, pressed && { opacity: 0.8 }]} hitSlop={4}>
      <Icon name={icon} size={16} color={active ? colors.white : colors.prune700} />
      <Text style={[s.chipLabel, active && { color: colors.white }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
      {onRemove && <Icon name="close" size={16} color={active ? colors.white : colors.prune700} />}
    </Pressable>
  )
}

function Composer({ mapId, members, citables, me, canPhoto, bottomInset, onMe }: {
  mapId: number; members: ChatMember[]; citables: Citable[]; me: Position | null; canPhoto: boolean; bottomInset: number; onMe: (position: Position) => void
}) {
  const [text, setText] = useState('')
  const [cursor, setCursor] = useState(0)
  const [pin, setPin] = useState<Pin | null>(null)
  const [locating, setLocating] = useState(false)
  const [shot, setShot] = useState<Shot | null>(null)
  const cited = useRef(new Map<number, string>())
  const input = useRef<TextInput>(null)

  const query = typedQuery(text, cursor)
  const featureMatches = query?.sign === '#' ? matchCitables(citables, query.query) : []
  const memberMatches = query?.sign === '@' ? matchMembers(members, query.query) : []

  const choose = (token: string) => {
    if (!query) return
    const next = insertToken(text, query, token)
    setText(next.text)
    setCursor(next.cursor)
    haptics.select()
  }

  const pinHere = async () => {
    if (pin) { setPin(null); return }
    setLocating(true)
    const fix = await currentPositionWithAccuracy()
    setLocating(false)
    if (!fix) { Alert.alert(t('mobile.chat.no_position')); return }
    setPin({ position: fix.position, accuracy: fix.accuracy })
    onMe(fix.position)
    haptics.success()
  }

  const photo = async () => {
    if (shot) { setShot(null); return }
    const taken = await takePhoto()
    if (!taken) return
    setShot({ file: taken.file, position: taken.position, takenAt: taken.takenAt, heading: taken.heading ?? (await currentHeading()) })
    // A photo taken here pins the message where it was taken.
    if (!pin && taken.position) setPin({ position: taken.position, accuracy: null })
  }

  const send = () => {
    const body = text.trim()
    if (!body) return
    const at = pin?.position ?? null
    outbox.add({
      type: 'chatMessage', mapId, body, featureIds: citedIds(body, cited.current),
      lng: at?.[0] ?? null, lat: at?.[1] ?? null,
      photo: shot?.file ?? null, takenAt: shot?.takenAt ?? null, heading: shot?.heading ?? null,
    })
    haptics.tap()
    setText('')
    setCursor(0)
    setPin(null)
    setShot(null)
    cited.current = new Map()
  }

  const pinLabel = pin
    ? pin.accuracy ? t('mobile.chat.pin_set_accuracy', { meters: String(Math.round(pin.accuracy)) }) : t('mobile.chat.pin_set')
    : t('mobile.chat.pin')

  return (
    <View style={[s.composer, { paddingBottom: Math.max(bottomInset, space.sm) }]}>
      {(featureMatches.length > 0 || memberMatches.length > 0) && (
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={s.suggestions}
          accessibilityLabel={query?.sign === '#' ? t('mobile.chat.suggest_features') : t('mobile.chat.suggest_people')}>
          {featureMatches.map((item) => (
            <PointChip key={item.id} icon="plant"
              label={item.meters != null && item.meters < 1000 ? `${item.label} · ${Math.round(item.meters)} m` : item.label}
              onPress={() => { cited.current.set(item.id, item.label); choose(`#${item.label}`) }} />
          ))}
          {memberMatches.map((member) => (
            <PointChip key={member.id} icon="person" label={member.name} onPress={() => choose(`@${member.handle}`)} />
          ))}
        </ScrollView>
      )}
      {shot && (
        <View style={s.attached}>
          <RemoteImage local={shot.file} style={s.attachedPhoto} />
          <Text style={[s.meta, { flex: 1 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.chat.photo_attached')}</Text>
          <IconButton icon="close" size={touch.min} label={t('mobile.chat.photo_remove')} onPress={() => setShot(null)} />
        </View>
      )}
      <View style={s.tools}>
        <PointChip icon={locating ? 'sending' : 'point'} label={pinLabel} active={!!pin} onPress={() => void pinHere()} />
        {canPhoto && <PointChip icon="photo" label={shot ? t('mobile.chat.photo_ready') : t('mobile.chat.photo')} active={!!shot} onPress={() => void photo()} />}
        {!me && !pin && <Text style={s.meta} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.chat.tools_hint')}</Text>}
      </View>
      <View style={s.inputRow}>
        <TextInput ref={input} value={text} multiline maxLength={4000}
          onChangeText={setText} onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
          placeholder={t('mobile.chat.placeholder')} placeholderTextColor={colors.loam400} maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={s.input} accessibilityLabel={t('mobile.chat.placeholder')} />
        <Pressable onPress={send} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel={t('mobile.chat.send')}
          accessibilityState={{ disabled: !text.trim() }}
          style={({ pressed }) => [s.send, !text.trim() && s.sendOff, pressed && { transform: [{ scale: 0.96 }] }]}>
          <Icon name="send" color={text.trim() ? colors.white : colors.loam500} />
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.loam50 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.loam200, backgroundColor: colors.paper,
  },
  title: { ...type.title, color: colors.loam900 },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { ...type.meta, color: colors.loam600 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  list: { padding: space.lg, gap: space.md, flexGrow: 1 },
  hint: { ...type.meta, color: colors.loam500, textAlign: 'center', paddingVertical: space.md },
  empty: { flex: 1, justifyContent: 'center', gap: space.sm, paddingVertical: space.xxl },
  hand: { ...type.hand, fontSize: 24, lineHeight: 28, color: colors.prune700 },
  day: { ...type.label, color: colors.loam500, textAlign: 'center', marginVertical: space.sm },
  message: {
    alignSelf: 'flex-start', maxWidth: '88%', gap: space.xs, padding: space.md, borderRadius: radius.lg,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.loam200, ...shadows.xs,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.prune50, borderColor: colors.prune100 },
  waiting: { opacity: 0.85, borderStyle: 'dashed', borderColor: colors.prune300 },
  highlighted: { borderColor: colors.humus400, borderWidth: 2 },
  author: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.loam800 },
  time: { fontFamily: fonts.body, fontSize: 14, color: colors.loam500 },
  body: { ...type.body, color: colors.loam900 },
  mention: { fontFamily: fonts.bold, color: colors.prune700 },
  cited: { fontFamily: fonts.bold, color: colors.leaf700, textDecorationLine: 'underline' },
  link: { color: colors.prune700, textDecorationLine: 'underline' },
  photo: { width: 220, height: 165, borderRadius: radius.md, marginTop: space.xs },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min, maxWidth: 280, marginTop: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.prune200, backgroundColor: colors.white,
  },
  fileName: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: colors.prune700 },
  play: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playMark: { color: colors.white, fontSize: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  chip: {
    minHeight: 40, maxWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.prune200, backgroundColor: colors.paper,
  },
  chipActive: { backgroundColor: colors.prune600, borderColor: colors.prune600 },
  chipLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.prune700, flexShrink: 1 },
  composer: { borderTopWidth: 1, borderTopColor: colors.loam200, backgroundColor: colors.paper, paddingTop: space.sm, paddingHorizontal: space.md, gap: space.sm },
  suggestions: { gap: space.sm, paddingVertical: 2 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  attached: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  attachedPhoto: { width: 56, height: 56, borderRadius: radius.md },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1, minHeight: touch.min, maxHeight: 140, borderRadius: radius.control, borderWidth: 1, borderColor: colors.loam300,
    backgroundColor: colors.white, paddingHorizontal: space.md, paddingTop: 12, paddingBottom: 12, fontSize: 16, fontFamily: fonts.body, color: colors.loam900,
  },
  send: { width: touch.min, height: touch.min, borderRadius: touch.min / 2, backgroundColor: colors.prune600, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: colors.loam100 },
})
