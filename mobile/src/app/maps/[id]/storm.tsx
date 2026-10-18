// « Pendant l'averse »: while it rains, the person draws with a finger
// where the water runs, where it stands and where it comes out of the
// ground, then says how hard it rains. Each mark becomes a
// `storm_observation` of the map, compared on the website with the flow
// the relief predicts. Works offline: everything goes through the outbox.
import { Camera, GeoJSONSource, Layer, Map, UserLocation, type MapRef } from '@maplibre/maplibre-react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from '@/lib/i18n'
import { currentPositionWithAccuracy } from '@/lib/location'
import { display, useDisplay } from '@/lib/display'
import { outbox } from '@/lib/outbox'
import { markGeometry, RAINS, stormProperties, thinStroke, type Rain, type StormMark, type StormWater } from '@/lib/storm'
import type { Position } from '@/lib/types'
import { FeatureLayers } from '@/map/FeatureLayers'
import { useMapBundle } from '@/state/useMapBundle'
import { useMapStyle } from '@/state/useMapStyle'
import { chooseMedia, type MediaChoice } from '@/ui/chooseMedia'
import { Body, Button, Chip, IconButton, Input, Label, Notice } from '@/ui/kit'
import { Icon, type IconName } from '@/ui/Icon'
import { toast } from '@/ui/Toast'
import { colors, fonts, radius, shadow, space } from '@/ui/theme'

const WATER = '#0e8fd6'
const TOOLS: Array<{ water: StormWater; icon: IconName }> = [
  { water: 'flows', icon: 'flows' },
  { water: 'pools', icon: 'pools' },
  { water: 'seeps', icon: 'seeps' },
]

type Pixel = { x: number; y: number }

export default function StormScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle } = useMapBundle(mapId)
  const mapStyle = useMapStyle(mapId, bundle)
  const shown = useDisplay(mapId)
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapRef>(null)
  const [observedAt] = useState(() => new Date().toISOString())
  const [tool, setTool] = useState<StormWater | null>('flows')
  const [stroke, setStroke] = useState<Pixel[]>([])
  const [marks, setMarks] = useState<StormMark[]>([])
  const [step, setStep] = useState<'draw' | 'details'>('draw')
  const [rain, setRain] = useState<Rain | null>('heavy')
  const [rainMm, setRainMm] = useState('')
  const [muddy, setMuddy] = useState(false)
  const [notes, setNotes] = useState('')
  const [media, setMedia] = useState<MediaChoice['items']>([])
  const [problem, setProblem] = useState<string | null>(null)
  const nextId = useRef(1)
  const strokeRef = useRef<Pixel[]>([])

  const addMark = (water: StormWater, coordinates: Position[]) => {
    const mark = { id: nextId.current++, water, coordinates }
    if (!markGeometry(mark)) { setProblem(t(`mobile.storm.too_short_${water}`)); return }
    setProblem(null)
    setMarks((all) => [...all, mark])
  }

  const unproject = async (points: Pixel[]): Promise<Position[]> => {
    const map = mapRef.current
    if (!map) return []
    const coordinates = await Promise.all(points.map((p) => map.unproject([p.x, p.y]).catch(() => null)))
    return coordinates.filter((c): c is [number, number] => Array.isArray(c)).map(([lng, lat]) => [lng, lat])
  }

  // The finger draws while a tool is chosen; the map pans otherwise.
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      strokeRef.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]
      setStroke(strokeRef.current)
    },
    onPanResponderMove: (e) => {
      strokeRef.current = [...strokeRef.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]
      setStroke(strokeRef.current)
    },
    onPanResponderRelease: () => {
      const points = thinStroke(strokeRef.current)
      const water = tool
      strokeRef.current = []
      if (!water) return
      void unproject(water === 'seeps' ? points.slice(-1) : points).then((coordinates) => {
        setStroke([])
        addMark(water, coordinates)
      })
    },
    onPanResponderTerminate: () => { strokeRef.current = []; setStroke([]) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tool])

  const seepHere = async () => {
    const fix = await currentPositionWithAccuracy()
    if (fix) addMark('seeps', [fix.position])
    else setProblem(t('mobile.plant.no_position'))
  }

  const addMedia = async () => {
    const choice = await chooseMedia()
    if (choice) setMedia((all) => [...all, ...choice.items])
  }

  const save = () => {
    const properties = stormProperties({ rain, rainMm, muddy, observedAt })
    const ids = marks.flatMap((mark) => {
      const geometry = markGeometry(mark)
      return geometry ? [outbox.addFeature(mapId, { layer: 'water', kind: 'storm_observation', notes: notes.trim() || null, properties, geometry })] : []
    })
    if (ids.length) display.reveal(mapId, { layer: 'water', kind: 'storm_observation' }, undefined)
    for (const item of media) {
      outbox.add({
        type: 'uploadPhoto', mapId, file: item.file, takenAt: item.takenAt,
        lng: item.position?.[0] ?? null, lat: item.position?.[1] ?? null, featureId: ids[0] ?? null, heading: item.heading ?? null,
      })
    }
    toast(t('mobile.storm.saved_title'), { body: t('mobile.storm.saved', { count: ids.length }) })
    router.back()
  }

  const leave = () => {
    if (marks.length === 0) { router.back(); return }
    Alert.alert(t('mobile.storm.leave_title'), t('mobile.storm.leave_body'), [
      { text: t('mobile.record.keep_going'), style: 'cancel' },
      { text: t('mobile.record.discard'), style: 'destructive', onPress: () => router.back() },
    ])
  }

  const drawn = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: marks.flatMap((mark) => {
      const geometry = markGeometry(mark)
      return geometry ? [{ type: 'Feature' as const, id: mark.id, geometry: geometry as GeoJSON.Geometry, properties: { water: mark.water } }] : []
    }),
  }), [marks])

  if (!bundle) {
    return (
      <View style={[s.fill, s.center]}>
        <Body>{t('mobile.terrain.loading')}</Body>
      </View>
    )
  }

  const bbox = bundle.map.bbox
  const counts = (['flows', 'pools', 'seeps'] as const).map((water) => [water, marks.filter((m) => m.water === water).length] as const)

  return (
    <View style={s.fill}>
      <Map ref={mapRef} style={s.fill} mapStyle={mapStyle} logo={false} attributionPosition={{ bottom: 8, left: 8 }}>
        <Camera initialViewState={bbox ? { bounds: bbox, padding: { top: 120, bottom: 260, left: 30, right: 30 } } : { center: bundle.map.center ?? [4.95, 50.32], zoom: bundle.map.zoom ?? 17 }} />
        <FeatureLayers bundle={bundle} display={shown} selectedId={null} onSelect={() => {}} />
        <GeoJSONSource id="storm-marks" data={drawn}>
          <Layer id="storm-fill" type="fill" filter={['==', ['geometry-type'], 'Polygon']} paint={{ 'fill-color': WATER, 'fill-opacity': 0.3 }} />
          <Layer id="storm-casing" type="line" filter={['!=', ['geometry-type'], 'Point']} paint={{ 'line-color': '#ffffff', 'line-width': 7 }} />
          <Layer id="storm-line" type="line" filter={['!=', ['geometry-type'], 'Point']} paint={{ 'line-color': WATER, 'line-width': 4, 'line-dasharray': [2, 1] }} />
          <Layer id="storm-point" type="circle" filter={['==', ['geometry-type'], 'Point']}
            paint={{ 'circle-color': WATER, 'circle-radius': 9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }} />
        </GeoJSONSource>
        <UserLocation accuracy heading />
      </Map>

      {/* The finger's stroke, drawn as it goes. */}
      {step === 'draw' && tool && (
        <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
          {stroke.map((p, i) => <View key={i} pointerEvents="none" style={[s.dot, { left: p.x - 3, top: p.y - 3 }]} />)}
        </View>
      )}

      <View style={[s.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton icon="back" label={t('mobile.common.back')} onPress={leave} />
        <View style={s.headerCard}>
          <Text style={s.headerTitle}>{t('mobile.storm.title')}</Text>
          <Text style={s.headerSub}>{tool && step === 'draw' ? t(`mobile.storm.hint_${tool}`) : t('mobile.storm.hint_pan')}</Text>
        </View>
      </View>

      {step === 'draw' ? (
        <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
          {problem && <Notice tone="warning">{problem}</Notice>}
          <View style={s.tools}>
            {TOOLS.map(({ water, icon }) => (
              <Pressable key={water} onPress={() => setTool(tool === water ? null : water)} accessibilityRole="button"
                accessibilityState={{ selected: tool === water }} style={[s.tool, tool === water && s.toolActive]}>
                <Icon name={icon} size={26} color={tool === water ? colors.white : colors.blueberry} />
                <Text style={[s.toolLabel, tool === water && { color: colors.white }]}>{t(`mobile.storm.water.${water}`)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.row}>
            <Text style={s.count}>
              {marks.length === 0 ? t('mobile.storm.none_yet') : counts.filter(([, n]) => n > 0).map(([water, n]) => t(`mobile.storm.count_${water}`, { count: n })).join(' · ')}
            </Text>
            {marks.length > 0 && (
              <Pressable onPress={() => setMarks((all) => all.slice(0, -1))} accessibilityRole="button"
                style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 }}>
                <Icon name="undo" size={20} color={colors.prune700} />
                <Text style={s.link}>{t('mobile.storm.undo')}</Text>
              </Pressable>
            )}
          </View>
          {tool === 'seeps' && <Button variant="secondary" label={t('mobile.storm.seep_here')} onPress={seepHere} />}
          <Button label={t('mobile.storm.next')} disabled={marks.length === 0} onPress={() => { setTool(null); setStep('details') }} />
        </View>
      ) : (
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <ScrollView contentContainerStyle={{ gap: space.sm, padding: space.md }} keyboardShouldPersistTaps="handled">
            <Label>{t('mobile.storm.rain')}</Label>
            <View style={s.chips}>
              {RAINS.map((value) => <Chip key={value} label={t(`mobile.storm.rains.${value}`)} selected={rain === value} onPress={() => setRain(rain === value ? null : value)} />)}
            </View>
            <Label>{t('mobile.storm.rain_mm')}</Label>
            <Input value={rainMm} onChangeText={setRainMm} keyboardType="decimal-pad" placeholder={t('mobile.storm.rain_mm_placeholder')} />
            <View style={s.chips}>
              <Chip label={t('mobile.storm.muddy')} selected={muddy} onPress={() => setMuddy((v) => !v)} />
            </View>
            {muddy && <Body muted>{t('mobile.storm.muddy_hint')}</Body>}
            <Label>{t('mobile.record.notes')}</Label>
            <Input value={notes} onChangeText={setNotes} placeholder={t('mobile.storm.notes_placeholder')} multiline />
            <Button variant="secondary" label={media.length ? t('mobile.storm.media_count', { count: media.length }) : t('mobile.storm.media')} onPress={addMedia} />
            <Button label={t('mobile.storm.save', { count: marks.length })} onPress={save} />
            <Button variant="ghost" label={t('mobile.storm.back_to_map')} onPress={() => setStep('draw')} />
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.loam50 },
  center: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: WATER },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.md },
  headerCard: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, ...shadow },
  headerTitle: { fontSize: 17, fontFamily: fonts.title, color: colors.loam900 },
  headerSub: { fontSize: 14, color: colors.loam600 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md, gap: space.sm },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...shadow },
  tools: { flexDirection: 'row', gap: space.sm },
  tool: { flex: 1, minHeight: 68, borderRadius: radius.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 2, ...shadow },
  toolActive: { backgroundColor: WATER },
  toolLabel: { fontSize: 14, fontFamily: fonts.bold, color: colors.loam700 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, ...shadow },
  count: { fontSize: 14, color: colors.loam700, flex: 1 },
  link: { fontSize: 14, fontFamily: fonts.bold, color: colors.prune600 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
