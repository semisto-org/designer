// « Mesurer »: instead of « 8 x 50 = 400 m² » guessed by eye, the person
// taps the corners on the map or walks to each one and taps « Point ici »;
// the length, the area in m² and ares, and each side are read live. The
// measure can then become an element of the map (a hedge, a bed, a swale)
// through the record screen. Works offline on the downloaded map.
import { Camera, GeoJSONSource, Layer, Map, UserLocation } from '@maplibre/maplibre-react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDisplay } from '@/lib/display'
import { haptics } from '@/lib/haptics'
import { formatArea, formatDistance, t } from '@/lib/i18n'
import { currentPositionWithAccuracy } from '@/lib/location'
import { styleUrl } from '@/lib/maps'
import { canClose, encodePoints, measureGeometry, measureOf, sideLabels, type MeasureShape } from '@/lib/measure'
import { canEdit, type Position } from '@/lib/types'
import { FeatureLayers } from '@/map/FeatureLayers'
import { useMapBundle } from '@/state/useMapBundle'
import { Icon } from '@/ui/Icon'
import { Body, Button, Chip, IconButton, MAX_FONT_SCALE, Notice } from '@/ui/kit'
import { colors, fonts, radius, shadows, space, type } from '@/ui/theme'

const FONT = ['Noto Sans Regular']

export default function MeasureScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle } = useMapBundle(mapId)
  const shown = useDisplay(mapId)
  const insets = useSafeAreaInsets()
  const [points, setPoints] = useState<Position[]>([])
  const [shape, setShape] = useState<MeasureShape>('LineString')
  const [locating, setLocating] = useState(false)
  const [problem, setProblem] = useState<{ tone: 'warning' | 'error'; text: string } | null>(null)

  // A surface needs three points: with fewer, it reads as a line.
  const surface = shape === 'Polygon' && canClose(points)
  const measure = measureOf(points)

  const add = (point: Position) => {
    haptics.tap()
    // The third point closes the shape: most measures on a terrain are surfaces.
    if (points.length === 2) setShape('Polygon')
    setPoints([...points, point])
  }

  const here = async () => {
    setLocating(true); setProblem(null)
    const fix = await currentPositionWithAccuracy()
    setLocating(false)
    if (!fix) { setProblem({ tone: 'error', text: t('mobile.plant.no_position') }); return }
    add(fix.position)
    if (fix.accuracy && fix.accuracy > 8) setProblem({ tone: 'warning', text: t('mobile.measure.here_imprecise', { accuracy: formatDistance(fix.accuracy) }) })
  }

  const undo = () => {
    setProblem(null)
    if (points.length <= 3) setShape('LineString')
    setPoints(points.slice(0, -1))
  }

  const leave = () => {
    if (points.length < 2) { router.back(); return }
    Alert.alert(t('mobile.measure.leave_title'), t('mobile.measure.leave_body'), [
      { text: t('mobile.record.keep_going'), style: 'cancel' },
      { text: t('mobile.measure.leave'), style: 'destructive', onPress: () => router.back() },
    ])
  }

  const keep = () => {
    if (!measureGeometry(points, surface ? 'Polygon' : 'LineString')) return
    router.replace({ pathname: '/maps/[id]/record', params: { id: String(mapId), points: encodePoints(points), shape: surface ? 'Polygon' : 'LineString' } })
  }

  const drawn = useMemo<GeoJSON.FeatureCollection>(() => {
    const geometry = measureGeometry(points, surface ? 'Polygon' : 'LineString')
    return {
      type: 'FeatureCollection',
      features: [
        ...(geometry ? [{ type: 'Feature' as const, geometry: geometry as GeoJSON.Geometry, properties: {} }] : []),
        ...points.map((p, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: p }, properties: { last: i === points.length - 1 ? 1 : 0 } })),
      ],
    }
  }, [points, surface])
  const sides = useMemo(() => sideLabels(points, surface ? 'Polygon' : 'LineString', formatDistance), [points, surface])

  if (!bundle) {
    return <View style={[s.fill, s.center]}><Body>{t('mobile.terrain.loading')}</Body></View>
  }

  const bbox = bundle.map.bbox
  const editable = canEdit(bundle.map)
  const hint = points.length === 0 ? t('mobile.measure.hint_empty') : points.length === 1 ? t('mobile.measure.hint_more') : points.length === 2 ? t('mobile.measure.hint_line') : null
  const ares = surface && measure.area !== null && measure.area >= 100 && measure.area < 100_000
    ? t('mobile.measure.ares', { ares: (measure.area / 100).toLocaleString('fr-BE', { maximumFractionDigits: 1 }) }) : null
  const big = surface && measure.area !== null ? formatArea(measure.area) : formatDistance(measure.length)
  const small = surface && measure.perimeter !== null
    ? [ares, t('mobile.measure.perimeter', { length: formatDistance(measure.perimeter) })].filter(Boolean).join(' · ')
    : points.length >= 2 ? [t('mobile.measure.length'), t('mobile.measure.sides', { count: points.length - 1 })].join(' · ') : null

  return (
    <View style={s.fill}>
      <Map style={s.fill} mapStyle={styleUrl(mapId)} logo={false} attributionPosition={{ top: insets.top + 72, left: 8 }}
        onPress={(e) => add(e.nativeEvent.lngLat)}>
        <Camera initialViewState={bbox ? { bounds: bbox, padding: { top: 120, bottom: 300, left: 30, right: 30 } } : { center: bundle.map.center ?? [4.95, 50.32], zoom: bundle.map.zoom ?? 17 }} />
        <FeatureLayers bundle={bundle} display={shown} selectedId={null} />
        <GeoJSONSource id="measure" data={drawn}>
          <Layer id="measure-fill" type="fill" filter={['==', ['geometry-type'], 'Polygon']} paint={{ 'fill-color': colors.prune600, 'fill-opacity': 0.2 }} />
          <Layer id="measure-casing" type="line" filter={['!=', ['geometry-type'], 'Point']} paint={{ 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 }} />
          <Layer id="measure-line" type="line" filter={['!=', ['geometry-type'], 'Point']} paint={{ 'line-color': colors.prune700, 'line-width': 3.5, 'line-dasharray': [2, 1] }} />
          <Layer id="measure-point" type="circle" filter={['==', ['geometry-type'], 'Point']}
            paint={{ 'circle-color': ['case', ['==', ['get', 'last'], 1], colors.prune700, '#ffffff'], 'circle-radius': 7, 'circle-stroke-color': colors.prune700, 'circle-stroke-width': 3 }} />
        </GeoJSONSource>
        <GeoJSONSource id="measure-sides" data={sides}>
          <Layer id="measure-side-label" type="symbol"
            layout={{ 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 15, 'text-allow-overlap': true }}
            paint={{ 'text-color': colors.prune700, 'text-halo-color': '#ffffff', 'text-halo-width': 2 }} />
        </GeoJSONSource>
        <UserLocation accuracy heading />
      </Map>

      <View style={[s.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton icon="back" label={t('mobile.common.back')} onPress={leave} />
        <View style={s.headerCard}>
          <Text style={s.headerTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.measure.title')}</Text>
          {hint && <Text style={s.headerSub} maxFontSizeMultiplier={MAX_FONT_SCALE}>{hint}</Text>}
        </View>
      </View>

      <View style={[s.panel, { paddingBottom: insets.bottom + space.md }]}>
        <View style={s.readout} accessible accessibilityLiveRegion="polite" accessibilityLabel={[big, small].filter(Boolean).join(', ')}>
          <View style={{ flex: 1 }}>
            <Text style={s.big} maxFontSizeMultiplier={1.3}>{big}</Text>
            {small && <Text style={s.small} maxFontSizeMultiplier={MAX_FONT_SCALE}>{small}</Text>}
          </View>
          {points.length > 0 && (
            <Pressable onPress={undo} accessibilityRole="button" accessibilityLabel={t('mobile.measure.undo')} style={s.undo}>
              <Icon name="undo" size={22} color={colors.prune700} />
            </Pressable>
          )}
        </View>
        {canClose(points) && (
          <View style={s.chips}>
            <Chip role="radio" label={t('mobile.measure.as_line')} selected={!surface} onPress={() => setShape('LineString')} />
            <Chip role="radio" label={t('mobile.measure.as_surface')} selected={surface} onPress={() => setShape('Polygon')} />
          </View>
        )}
        {problem && <Notice tone={problem.tone}>{problem.text}</Notice>}
        <View style={s.row}>
          <Button icon="point" variant="secondary" label={t('mobile.measure.here')} busy={locating} onPress={here} style={{ flexGrow: 1 }}
            accessibilityHint={t('mobile.measure.here_hint')} />
          {editable && <Button icon="check" label={t('mobile.measure.keep')} disabled={points.length < 2} onPress={keep} style={{ flexGrow: 1 }}
            accessibilityHint={t('mobile.measure.keep_hint')} />}
        </View>
        {editable && points.length === 0 && (
          <Button variant="ghost" icon="trace" label={t('mobile.measure.walk')} accessibilityHint={t('mobile.measure.walk_hint')}
            onPress={() => router.replace({ pathname: '/maps/[id]/record', params: { id: String(mapId), walk: '1' } })} />
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.loam50 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.md },
  headerCard: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.loam200, paddingHorizontal: space.md, paddingVertical: space.sm, ...shadows.md },
  headerTitle: { ...type.mapName, color: colors.loam900 },
  headerSub: { ...type.meta, color: colors.loam600 },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md,
    backgroundColor: colors.paper, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, ...shadows.lg,
  },
  readout: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  big: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.prune700 },
  small: { ...type.hand, color: colors.loam700 },
  undo: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.loam200 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
