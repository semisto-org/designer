// « Esquisser sur la photo »: draw an idea with a finger over a photo of
// the terrain (a hedge here, the pond there), with the website's inks,
// widths, handwritten notes, an eraser and undo. The sketch is the same
// PhotoSketch as on the computer (POST / PATCH /maps/:id/photos/:id/sketches),
// saved online: offline, the drawing stays on screen until the signal is
// back. `?sketchId=` opens an existing sketch to change it.
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { api, ApiError } from '@/lib/api'
import { haptics } from '@/lib/haptics'
import { t } from '@/lib/i18n'
import { hasRoom, INKS, LINE_WIDTHS, markAt, noteMark, simplify, toFrame, WIDTH_KEYS, type Sketch, type SketchMark, type WidthKey } from '@/lib/sketch'
import { useMapBundle } from '@/state/useMapBundle'
import { rememberSketch, useSketches } from '@/state/useSketches'
import { useOnline } from '@/state/sync'
import { Body, Button, Chip, IconButton, Input, MAX_FONT_SCALE, Notice, styles } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { SketchLayer } from '@/ui/SketchLayer'
import { toast } from '@/ui/Toast'
import { colors, radius, space, type } from '@/ui/theme'

type Tool = 'pen' | 'text' | 'eraser'
const TOOLS: Tool[] = ['pen', 'text', 'eraser']

export default function SketchScreen() {
  const params = useLocalSearchParams<{ id: string; photoId: string; sketchId?: string }>()
  const mapId = Number(params.id)
  const photoId = Number(params.photoId)
  const sketchId = params.sketchId ? Number(params.sketchId) : null
  const { bundle } = useMapBundle(mapId)
  const photo = bundle?.photos.find((p) => p.id === photoId)
  const online = useOnline()
  const { sketches, loaded } = useSketches(mapId, photoId, sketchId !== null)
  const navigation = useNavigation()
  const window = useWindowDimensions()

  const [sketch, setSketch] = useState<Sketch | null>(null)
  const [marks, setMarks] = useState<SketchMark[]>([])
  const [history, setHistory] = useState<SketchMark[][]>([])
  const [tool, setTool] = useState<Tool>('pen')
  const [ink, setInk] = useState<string>(INKS[0])
  const [width, setWidth] = useState<WidthKey>('medium')
  const [drawing, setDrawing] = useState<[number, number][] | null>(null)
  const [note, setNote] = useState<{ x: number; y: number; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [surface, setSurface] = useState(0)
  const saved = useRef(false)

  // An existing sketch, once the list arrives.
  useEffect(() => {
    if (sketchId === null || sketch) return
    const found = sketches.find((s) => s.id === sketchId)
    if (found) { setSketch(found); setMarks(found.strokes) }
  }, [sketchId, sketches, sketch])

  const dirty = history.length > 0
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!dirty || saved.current) return
    event.preventDefault()
    Alert.alert(t('mobile.sketch.discard_title'), t('mobile.sketch.discard_body'), [
      { text: t('mobile.sketch.keep'), style: 'cancel' },
      { text: t('mobile.sketch.discard'), style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
    ])
  }), [navigation, dirty])

  // The photo fits the screen's width, and at most 60 % of its height.
  const aspect = photo?.width && photo?.height ? photo.width / photo.height : size ? size.width / size.height : 3 / 4
  const maxHeight = window.height * 0.6
  const w = surface > 0 ? Math.min(surface, maxHeight * aspect) : 0
  const h = w / aspect

  // The responder reads the latest values through a ref (it is built once).
  const live = useRef({ tool, ink, width, w, h, aspect, marks })
  live.current = { tool, ink, width, w, h, aspect, marks }
  const stroke = useRef<[number, number][]>([])

  const change = (next: SketchMark[]) => {
    setHistory((past) => [...past, live.current.marks])
    setMarks(next)
    setError(null)
  }
  const changeRef = useRef(change)
  changeRef.current = change

  const responder = useMemo(() => {
    const erase = (x: number, y: number) => {
      const { marks: current, aspect: a } = live.current
      const index = markAt(current, x, y, a)
      if (index >= 0) { haptics.tap(); changeRef.current(current.filter((_, i) => i !== index)) }
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const { tool: current, w: sw, h: sh } = live.current
        const point = toFrame(event.nativeEvent.locationX, event.nativeEvent.locationY, sw, sh)
        if (current === 'pen') { stroke.current = [point]; setDrawing([point]) }
        else if (current === 'eraser') erase(...point)
        else setNote({ x: point[0], y: point[1], text: '' })
      },
      onPanResponderMove: (event) => {
        const { tool: current, w: sw, h: sh } = live.current
        const point = toFrame(event.nativeEvent.locationX, event.nativeEvent.locationY, sw, sh)
        if (current === 'pen') { stroke.current = [...stroke.current, point]; setDrawing(stroke.current) }
        else if (current === 'eraser') erase(...point)
      },
      onPanResponderRelease: () => {
        const { tool: current, ink: color, width: key, marks: existing } = live.current
        if (current !== 'pen' || stroke.current.length === 0) return
        const mark: SketchMark = { type: 'line', color, width: LINE_WIDTHS[key], points: simplify(stroke.current) }
        stroke.current = []
        setDrawing(null)
        if (hasRoom(existing, mark)) changeRef.current([...existing, mark])
        else setError(t('mobile.sketch.full'))
      },
    })
  }, [])

  if (!bundle || !photo || photo.kind === 'video') {
    return <View style={[styles.screen, styles.content]}><Body muted>{t('mobile.retake.gone')}</Body></View>
  }
  if (sketchId !== null && !sketch) {
    return (
      <View style={[styles.screen, styles.content]}>
        {online && !loaded ? <ActivityIndicator color={colors.prune600} /> : <Notice tone="warning">{t(online ? 'mobile.retake.gone' : 'mobile.sketch.offline')}</Notice>}
      </View>
    )
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (!previous) return
    setHistory(history.slice(0, -1))
    setMarks(previous)
  }

  const placeNote = () => {
    if (!note) return
    const mark = noteMark(note.text, note.x, note.y, ink, width)
    setNote(null)
    if (!mark) return
    if (hasRoom(marks, mark)) change([...marks, mark])
    else setError(t('mobile.sketch.full'))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const body = { sketch: sketch ? { strokes: marks, lock_version: sketch.lockVersion } : { strokes: marks } }
      const result = sketch
        ? await api<Sketch>('PATCH', `/maps/${mapId}/photos/${photoId}/sketches/${sketch.id}`, body)
        : await api<Sketch>('POST', `/maps/${mapId}/photos/${photoId}/sketches`, body)
      rememberSketch(mapId, result)
      saved.current = true
      haptics.success()
      toast(t('mobile.sketch.saved'), { body: result.name })
      router.back()
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && failure.body?.sketch) {
        // Someone changed it meanwhile: their version comes back, ours can be redrawn on it.
        const theirs = failure.body.sketch as Sketch
        rememberSketch(mapId, theirs)
        setSketch(theirs)
        setMarks(theirs.strokes)
        setHistory([])
        setError(t('photo_sketches.errors.stale'))
      } else {
        setError(failure instanceof ApiError && failure.offline ? t('mobile.sketch.save_offline') : failure instanceof Error && failure.message ? failure.message : t('photo_sketches.save_failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const hint = tool === 'pen' ? t('photo_sketches.hint_pen') : tool === 'text' ? t('mobile.sketch.hint_text') : t('mobile.sketch.hint_eraser')
  const shown = drawing ? [...marks, { type: 'line', color: ink, width: LINE_WIDTHS[width], points: drawing } as SketchMark] : marks

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { gap: space.md, paddingBottom: 48 }]} scrollEnabled={!drawing}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: sketch?.name ?? t('photo_sketches.title') }} />
      <View onLayout={(event) => setSurface(event.nativeEvent.layout.width)} style={{ alignItems: 'center' }}>
        {w > 0 && (
          <View style={[s.surface, { width: w, height: h }]} pointerEvents="box-only" {...responder.panHandlers}
            accessible accessibilityLabel={`${t('photo_sketches.title')}. ${hint}`}>
            <RemoteImage path={`/maps/${mapId}/photos/${photo.id}/image?size=large`} style={{ width: w, height: h }}
              onSize={(width, height) => setSize({ width, height })} />
            <SketchLayer marks={shown} width={w} height={h} />
            {note && <View style={[s.notePin, { left: note.x * w - 6, top: note.y * h - 6, backgroundColor: ink }]} />}
          </View>
        )}
      </View>

      {!online && <Notice tone="warning">{t('mobile.sketch.offline')}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {note ? (
        <View style={{ gap: space.sm }}>
          <Input value={note.text} onChangeText={(text) => setNote({ ...note, text })} placeholder={t('photo_sketches.text_placeholder')}
            autoFocus maxLength={200} returnKeyType="done" onSubmitEditing={placeNote} accessibilityLabel={t('photo_sketches.text_placeholder')} />
          <View style={s.row}>
            <Button label={t('photo_sketches.text_add')} icon="check" onPress={placeNote} disabled={!note.text.trim()} style={{ flex: 1 }} />
            <IconButton icon="close" label={t('mobile.sketch.discard')} onPress={() => setNote(null)} />
          </View>
        </View>
      ) : (
        <Body muted>{hint}</Body>
      )}

      <View style={s.row}>
        <View style={[s.chips, { flex: 1 }]} accessibilityRole="radiogroup" accessibilityLabel={t('photo_sketches.tools.label')}>
          {TOOLS.map((key) => <Chip key={key} role="radio" label={t(`photo_sketches.tools.${key}`)} selected={tool === key}
            onPress={() => { setTool(key); if (key !== 'text') setNote(null) }} />)}
        </View>
        <IconButton icon="undo" label={t('photo_sketches.tools.undo')} onPress={undo} />
      </View>

      <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('photo_sketches.tools.ink')}</Text>
      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={t('photo_sketches.tools.ink')}>
        {INKS.map((color) => (
          <Pressable key={color} onPress={() => { haptics.tap(); setInk(color) }} accessibilityRole="radio"
            accessibilityLabel={t('mobile.sketch.ink_label', { name: t(`mobile.sketch.inks.${color.slice(1)}`) })}
            accessibilityState={{ selected: ink === color }} hitSlop={4}
            style={[s.ink, { backgroundColor: color }, ink === color && s.inkSelected]} />
        ))}
      </View>

      <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('photo_sketches.tools.width')}</Text>
      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={t('photo_sketches.tools.width')}>
        {WIDTH_KEYS.map((key) => <Chip key={key} role="radio" label={t(`photo_sketches.tools.widths.${key}`)} selected={width === key} onPress={() => setWidth(key)} />)}
      </View>

      <Button label={t('photo_sketches.done')} icon="check" busy={saving} disabled={!dirty || !online} onPress={save} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  surface: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.loam100 },
  notePin: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.loam900 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  label: { ...type.label, color: colors.loam700 },
  ink: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.loam300 },
  inkSelected: { borderWidth: 3, borderColor: colors.prune600, transform: [{ scale: 1.1 }] },
})
