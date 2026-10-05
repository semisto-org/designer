// « Relever »: a GPS point where one stands (a spring, a tree, a problem…)
// or a trace walked along a hedge, a path, a boundary, saved as a line or a
// closed surface. Keeps recording with the screen off.
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { kindLabel, kindsFor, layerLabel } from '@/lib/elements'
import { cleanTrace, gpsProperties, lineLength, ringArea } from '@/lib/geo'
import { formatDistance, t } from '@/lib/i18n'
import { currentPositionWithAccuracy } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import { currentTrace, onFixes, startTrace, stopTrace, type Fix } from '@/lib/trace'
import type { Geometry, Position } from '@/lib/types'
import { Body, Button, Card, Chip, Input, Label, Notice, styles } from '@/ui/kit'
import { colors, fonts, space } from '@/ui/theme'

type Mode = 'choose' | 'point' | 'tracing' | 'trace'
type Shape = 'LineString' | 'Polygon'

export default function RecordScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const resumed = currentTrace()
  const [mode, setMode] = useState<Mode>(resumed?.mapId === mapId ? 'tracing' : 'choose')
  const [point, setPoint] = useState<{ position: Position; accuracy: number | null } | null>(null)
  const [fixes, setFixes] = useState<Fix[]>(resumed?.mapId === mapId ? resumed.fixes : [])
  const [positions, setPositions] = useState<Position[]>([])
  const [shape, setShape] = useState<Shape>('LineString')
  const [kind, setKind] = useState<{ layer: string; kind: string } | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => onFixes(setFixes), [])

  const recordPoint = async () => {
    setMode('point'); setProblem(null)
    const fix = await currentPositionWithAccuracy()
    if (fix) setPoint(fix)
    else setProblem(t('mobile.plant.no_position'))
  }

  const begin = async () => {
    setProblem(null)
    if ((await startTrace(mapId)) === 'no_permission') { setProblem(t('mobile.record.no_permission')); return }
    setFixes([]); setMode('tracing')
  }

  const finish = async () => {
    const points = await stopTrace()
    if (points.length < 2) {
      setProblem(t('mobile.record.too_short')); setMode('choose'); return
    }
    setPositions(points); setShape('LineString'); setMode('trace')
  }

  const cancel = () => {
    const leave = async () => { await stopTrace({ keep: false }); router.back() }
    if (mode === 'tracing') Alert.alert(t('mobile.record.cancel_title'), t('mobile.record.cancel_body'), [
      { text: t('mobile.record.keep_going'), style: 'cancel' },
      { text: t('mobile.record.discard'), style: 'destructive', onPress: leave },
    ])
    else router.back()
  }

  const geometry: Geometry | null = useMemo(() => {
    if (mode === 'point' && point) return { type: 'Point', coordinates: point.position }
    if (mode === 'trace' && shape === 'Polygon' && positions.length >= 3) return { type: 'Polygon', coordinates: [[...positions, positions[0]]] }
    if (mode === 'trace') return { type: 'LineString', coordinates: positions }
    return null
  }, [mode, point, positions, shape])

  const kinds = useMemo(() => (geometry ? kindsFor(geometry.type as 'Point' | 'LineString' | 'Polygon') : []), [geometry])
  useEffect(() => { if (kind && !kinds.some((k) => k.kind === kind.kind && k.layer === kind.layer)) setKind(null) }, [kinds, kind])

  const save = () => {
    if (!geometry || !kind) return
    outbox.addFeature(mapId, { layer: kind.layer, kind: kind.kind, name: name.trim() || null, notes: notes.trim() || null, properties: mode === 'point' ? gpsProperties(point?.accuracy ?? null) : {}, geometry })
    router.back()
  }

  if (mode === 'choose') {
    return (
      <View style={[styles.screen, styles.content]}>
        <Card style={{ gap: space.sm }}>
          <Text style={s.cardTitle}>{t('mobile.record.point')}</Text>
          <Body muted>{t('mobile.record.point_intro')}</Body>
          <Button label={t('mobile.record.point_button')} onPress={recordPoint} />
        </Card>
        <Card style={{ gap: space.sm }}>
          <Text style={s.cardTitle}>{t('mobile.record.trace')}</Text>
          <Body muted>{t('mobile.record.trace_intro')}</Body>
          <Button label={t('mobile.record.trace_start')} onPress={begin} />
        </Card>
        {problem && <Notice tone="error">{problem}</Notice>}
      </View>
    )
  }

  if (mode === 'tracing') {
    const walked = cleanTrace(fixes)
    const last = fixes[fixes.length - 1]
    return (
      <View style={[styles.screen, styles.content]}>
        <Card style={{ gap: space.sm, alignItems: 'center' }}>
          <Text style={s.big}>{formatDistance(lineLength(walked))}</Text>
          <Body muted>{t('mobile.record.points', { count: walked.length })}</Body>
          {last?.accuracy ? <Body muted>{t('mobile.record.accuracy', { accuracy: formatDistance(last.accuracy) })}</Body> : null}
        </Card>
        <Notice>{t('mobile.record.tracing_hint')}</Notice>
        <Button label={t('mobile.record.trace_stop')} onPress={finish} />
        <Button variant="ghost" label={t('mobile.common.cancel')} onPress={cancel} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">
      {mode === 'point' && !point && !problem && <Notice>{t('mobile.plant.locating')}</Notice>}
      {mode === 'point' && point && (
        <Notice tone={point.accuracy && point.accuracy > 10 ? 'warning' : 'info'}>
          {point.accuracy ? t('mobile.plant.position', { accuracy: formatDistance(point.accuracy) }) : t('mobile.plant.position_unknown_accuracy')}
        </Notice>
      )}
      {mode === 'trace' && (
        <>
          <View style={s.chips}>
            <Chip label={t('mobile.record.as_line')} selected={shape === 'LineString'} onPress={() => setShape('LineString')} />
            {positions.length >= 3 && <Chip label={t('mobile.record.as_surface')} selected={shape === 'Polygon'} onPress={() => setShape('Polygon')} />}
          </View>
          <Body>
            {shape === 'Polygon'
              ? t('mobile.record.area', { area: Math.round(ringArea([...positions, positions[0]])).toLocaleString('fr-BE') })
              : t('mobile.record.length', { length: formatDistance(lineLength(positions)) })}
          </Body>
        </>
      )}
      {problem && <Notice tone="error">{problem}</Notice>}

      <Label>{t('mobile.record.kind')}</Label>
      {groupByLayer(kinds).map(([layer, items]) => (
        <View key={layer} style={{ gap: space.xs }}>
          <Text style={s.layer}>{layerLabel(layer)}</Text>
          <View style={s.chips}>
            {items.map((item) => (
              <Chip key={item.kind} label={kindLabel(item.kind)} selected={kind?.kind === item.kind && kind.layer === item.layer} onPress={() => setKind(item)} />
            ))}
          </View>
        </View>
      ))}
      <Label>{t('mobile.record.name')}</Label>
      <Input value={name} onChangeText={setName} placeholder={t('mobile.record.name_placeholder')} />
      <Label>{t('mobile.record.notes')}</Label>
      <Input value={notes} onChangeText={setNotes} placeholder={t('mobile.record.notes_placeholder')} multiline />
      <Button style={{ marginTop: space.md }} label={t('mobile.record.save')} disabled={!geometry || !kind} onPress={save} />
      <Button variant="ghost" label={t('mobile.common.cancel')} onPress={cancel} />
    </ScrollView>
  )
}

function groupByLayer(kinds: { layer: string; kind: string }[]): [string, { layer: string; kind: string }[]][] {
  const groups = new Map<string, { layer: string; kind: string }[]>()
  kinds.forEach((k) => groups.set(k.layer, [...(groups.get(k.layer) ?? []), k]))
  return [...groups.entries()]
}

const s = StyleSheet.create({
  cardTitle: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900 },
  big: { fontSize: 40, fontFamily: fonts.title, color: colors.prune700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  layer: { fontSize: 13, fontFamily: fonts.medium, color: colors.loam600, marginTop: space.sm },
})
