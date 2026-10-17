// « Climat du lieu de stockage » on a fruit store's screen: the verdict of
// the latest reading and what to do, then a reading noted in a few taps
// (in the outbox when the cellar has no network).
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { api } from '@/lib/api'
import { measuresSomething, parseMeasure, storageAdvice, type ClimateStatus, type StorageVerdict } from '@/lib/fruitStore'
import { formatDate, t, todayIso } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import type { Op } from '@/lib/outbox-core'
import type { MapFeature } from '@/lib/types'
import { useOnline } from '@/state/sync'
import { Body, Button, Card, Input, Label } from '@/ui/kit'
import { colors, fonts, space } from '@/ui/theme'

type Reading = { id: number; measuredOn: string; temperatureC: number | null; temperatureMinC: number | null; temperatureMaxC: number | null; humidityPct: number | null; note: string | null; author: string | null; verdict: StorageVerdict }
type Data = { readings: Reading[]; summary: { latest: { measuredOn: string; verdict: StorageVerdict } | null; winterReadings: number } }

const TONE: Record<ClimateStatus, string> = { good: colors.leaf50, fair: colors.humus50, bad: colors.clay50, frost: '#e6f1f8' }
const decimal = (n: number) => n.toLocaleString('fr-BE')

export function StoreSection({ mapId, feature, editable, ops }: { mapId: number; feature: MapFeature; editable: boolean; ops: Op[] }) {
  const online = useOnline()
  const pending = ops.flatMap((op) => (op.type === 'createStorageReading' ? [op] : []))
  const [data, setData] = useState<Data | null>(null)
  const [temperature, setTemperature] = useState('')
  const [humidity, setHumidity] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!online || feature.id < 0) return
    try { setData(await api('GET', `/maps/${mapId}/features/${feature.id}/storage_readings`)) } catch { /* keep what we had */ }
  }, [online, mapId, feature.id])
  useEffect(() => { void load() }, [load, pending.length])

  const reading = {
    measuredOn: todayIso(), temperatureC: parseMeasure(temperature), temperatureMinC: parseMeasure(min),
    temperatureMaxC: parseMeasure(max), humidityPct: parseMeasure(humidity), note: note.trim() || null,
  }
  const save = () => {
    if (!measuresSomething(reading)) return
    outbox.add({ type: 'createStorageReading', mapId, featureId: feature.id, reading: { ...reading, humidityPct: reading.humidityPct === null ? null : Math.round(reading.humidityPct) } })
    setTemperature(''); setHumidity(''); setMin(''); setMax(''); setNote('')
    setSaved(true)
  }

  const latest = data?.summary.latest
  return (
    <>
      <Text style={s.section}>{t('storage_readings.title')}</Text>
      {latest?.verdict.overall
        ? (
          <Card style={{ gap: space.xs, backgroundColor: TONE[latest.verdict.overall] }}>
            <Body muted>{t('storage_readings.latest', { date: formatDate(latest.measuredOn) })}</Body>
            <Text style={s.verdict}>{t(`storage_readings.overall.${latest.verdict.overall}`)}</Text>
            {storageAdvice(latest.verdict).map((key) => <Body key={key}>{t(`storage_readings.advice.${key}`)}</Body>)}
          </Card>
        )
        : <Body muted>{t('storage_readings.intro')}</Body>}
      {data && data.summary.winterReadings === 0 && <Body muted>{t('storage_readings.winter.none')}</Body>}
      {editable && (
        <Card style={{ gap: space.sm }}>
          {saved && <Body>{online ? t('storage_readings.saved') : t('mobile.harvest.saved_offline')}</Body>}
          <View style={s.row}>
            <View style={s.cell}><Label>{t('storage_readings.temperature_c')}</Label><Input value={temperature} onChangeText={(v) => { setTemperature(v); setSaved(false) }} keyboardType="numbers-and-punctuation" /></View>
            <View style={s.cell}><Label>{t('storage_readings.humidity_pct')}</Label><Input value={humidity} onChangeText={(v) => { setHumidity(v); setSaved(false) }} keyboardType="number-pad" /></View>
          </View>
          <View style={s.row}>
            <View style={s.cell}><Label>{t('storage_readings.temperature_min_c')}</Label><Input value={min} onChangeText={setMin} keyboardType="numbers-and-punctuation" /></View>
            <View style={s.cell}><Label>{t('storage_readings.temperature_max_c')}</Label><Input value={max} onChangeText={setMax} keyboardType="numbers-and-punctuation" /></View>
          </View>
          <Body muted>{t('storage_readings.min_max_hint')}</Body>
          <Label>{t('storage_readings.note')}</Label>
          <Input value={note} onChangeText={setNote} placeholder={t('storage_readings.note_placeholder')} multiline />
          <Button label={t('storage_readings.save')} disabled={!measuresSomething(reading)} onPress={save} />
        </Card>
      )}
      <View style={{ gap: space.sm }}>
        {pending.map((op) => <ReadingRow key={op.id} {...op.reading} pending />)}
        {(data?.readings ?? []).slice(0, 8).map((r) => <ReadingRow key={r.id} {...r} />)}
        {!online && !data && <Body muted>{t('mobile.feature.history_offline')}</Body>}
        {data && data.readings.length === 0 && pending.length === 0 && <Body muted>{t('storage_readings.empty')}</Body>}
      </View>
    </>
  )
}

function ReadingRow({ measuredOn, temperatureC, temperatureMinC, temperatureMaxC, humidityPct, note, author, pending }: {
  measuredOn: string; temperatureC: number | null; temperatureMinC: number | null; temperatureMaxC: number | null; humidityPct: number | null; note: string | null; author?: string | null; pending?: boolean
}) {
  const parts = [
    temperatureC !== null ? t('storage_readings.temperature_value', { value: decimal(temperatureC) }) : null,
    humidityPct !== null ? t('storage_readings.humidity_value', { value: humidityPct }) : null,
  ]
  return (
    <Card style={{ padding: space.md, gap: 2 }}>
      <Text style={s.rowTitle}>{parts.filter(Boolean).join(' · ') || '—'}</Text>
      {temperatureMinC !== null && temperatureMaxC !== null && <Body>{t('storage_readings.min_max_value', { min: decimal(temperatureMinC), max: decimal(temperatureMaxC) })}</Body>}
      <Text style={s.rowMeta}>
        {[formatDate(measuredOn), author ? t('storage_readings.by', { name: author }) : null, pending ? t('mobile.feature.pending') : null].filter(Boolean).join(' · ')}
      </Text>
      {note ? <Body>{note}</Body> : null}
    </Card>
  )
}

const s = StyleSheet.create({
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  verdict: { fontSize: 17, fontFamily: fonts.bold, color: colors.loam900 },
  row: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 1, gap: space.xs },
  rowTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.loam900 },
  rowMeta: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
})
