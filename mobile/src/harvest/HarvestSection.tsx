// « Récolte » on a fruit tree's screen, made for a round in the orchard:
// fruit on the tree or harvest, how much, what for, saved in one tap (in
// the outbox when there is no network), then straight on to the next tree.
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { api } from '@/lib/api'
import { featureTitle } from '@/lib/elements'
import { amountsFor, HARVEST_STAGES, HARVEST_USES, nextTree, type HarvestAmount, type HarvestStage, type HarvestUse } from '@/lib/harvests'
import { formatDate, t, todayIso } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import type { Op } from '@/lib/outbox-core'
import type { MapBundle, MapFeature } from '@/lib/types'
import { useOnline } from '@/state/sync'
import { Body, Button, Card, Chip, Input, Label } from '@/ui/kit'
import { colors, fonts, space } from '@/ui/theme'

type Harvest = { id: number; notedOn: string; stage: HarvestStage; amount: HarvestAmount | null; uses: HarvestUse[]; quantityKg: number | null; note: string | null; author: string | null }
type SeasonSummary = { status: 'picked' | 'bore' | 'none' }
type PlantRow = { featureId: number; seasons: Record<string, SeasonSummary>; lastNotedOn: string | null }

const DOT: Record<string, string> = { picked: '#b01a19', bore: '#ef9b0d', none: '#6b665c' }

export function HarvestSection({ bundle, feature, editable, ops, allOps }: { bundle: MapBundle; feature: MapFeature; editable: boolean; ops: Op[]; allOps: Op[] }) {
  const mapId = bundle.map.id
  const online = useOnline()
  const pending = ops.flatMap((op) => (op.type === 'createHarvest' ? [op] : []))
  const [history, setHistory] = useState<{ harvests: Harvest[]; seasons: number[]; plant: PlantRow | null } | null>(null)
  const [noted, setNoted] = useState<Set<number>>(new Set())
  const [stage, setStage] = useState<HarvestStage | null>(null)
  const [amount, setAmount] = useState<HarvestAmount | null>(null)
  const [uses, setUses] = useState<HarvestUse[]>([])
  const [kg, setKg] = useState('')
  const [note, setNote] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const season = new Date().getFullYear()

  const load = useCallback(async () => {
    if (!online || feature.id < 0) return
    try {
      setHistory(await api('GET', `/maps/${mapId}/features/${feature.id}/plant_harvests`))
      const log = await api<{ plants: PlantRow[] }>('GET', `/maps/${mapId}/harvests?season=${season}`)
      setNoted(new Set(log.plants.filter((p) => p.lastNotedOn === todayIso()).map((p) => p.featureId)))
    } catch { /* keep what we had */ }
  }, [online, mapId, feature.id, season])
  useEffect(() => { void load() }, [load, pending.length])

  // Noted today (the round): from the server, plus everything waiting in the outbox.
  const notedNow = new Set(noted)
  notedNow.add(feature.id)
  allOps.forEach((op) => { if (op.type === 'createHarvest' && op.harvest.notedOn === todayIso()) notedNow.add(op.featureId) })
  const next = justSaved ? nextTree(bundle, feature, notedNow) : null

  const save = () => {
    if (!stage || (stage === 'on_tree' && !amount)) return
    const quantity = Number(kg.replace(',', '.'))
    outbox.add({
      type: 'createHarvest', mapId, featureId: feature.id,
      harvest: { notedOn: todayIso(), stage, amount, uses: stage === 'picked' ? uses : [], quantityKg: stage === 'picked' && quantity > 0 ? quantity : null, note: note.trim() || null },
    })
    setStage(null); setAmount(null); setUses([]); setKg(''); setNote('')
    setJustSaved(true)
  }

  const goNext = () => {
    if (!next) return
    router.replace({ pathname: '/maps/[id]/features/[featureId]', params: { id: String(mapId), featureId: String(next.feature.id) } })
  }

  return (
    <>
      <Text style={s.section}>{t('mobile.harvest.title')}</Text>
      {history?.plant && (
        <View style={s.strip}>
          {history.seasons.map((year) => {
            const status = history.plant?.seasons[String(year)]?.status
            return (
              <View key={year} style={{ alignItems: 'center', gap: 2 }}>
                <View style={[s.dot, status ? { backgroundColor: status === 'none' ? 'transparent' : DOT[status], borderColor: DOT[status], borderStyle: 'solid' } : null]} />
                <Text style={s.year}>{String(year).slice(2)}</Text>
              </View>
            )
          })}
        </View>
      )}
      {editable && (
        <Card style={{ gap: space.sm }}>
          {justSaved && (
            <View style={{ gap: space.sm }}>
              <Body>{online ? t('mobile.harvest.saved') : t('mobile.harvest.saved_offline')}</Body>
              {next
                ? <>
                    <Button label={t('mobile.harvest.next_tree', { name: featureTitle(next.feature, bundle.planting) })} onPress={goNext} />
                    <Body muted>{t('mobile.harvest.next_tree_hint', { meters: Math.round(next.meters) })}</Body>
                  </>
                : <Body muted>{t('mobile.harvest.all_noted')}</Body>}
            </View>
          )}
          <View style={s.chips}>
            {HARVEST_STAGES.map((value) => (
              <Chip key={value} label={t(`plant_harvests.stages.${value}`)} selected={stage === value}
                onPress={() => { setStage(value); setAmount(null); setJustSaved(false) }} />
            ))}
          </View>
          {stage && (
            <>
              <Label>{t('plant_harvests.amount')}</Label>
              <View style={s.chips}>
                {amountsFor(stage).map((value) => (
                  <Chip key={value} label={t(`plant_harvests.amounts.${stage}.${value}`)} selected={amount === value}
                    onPress={() => setAmount(amount === value && stage === 'picked' ? null : value)} />
                ))}
              </View>
            </>
          )}
          {stage === 'picked' && (
            <>
              <Label>{t('plant_harvests.uses_label')}</Label>
              <View style={s.chips}>
                {HARVEST_USES.map((value) => (
                  <Chip key={value} label={t(`plant_harvests.uses.${value}`)} selected={uses.includes(value)}
                    onPress={() => setUses(uses.includes(value) ? uses.filter((u) => u !== value) : [...uses, value])} />
                ))}
              </View>
              <Label>{t('plant_harvests.quantity_kg')}</Label>
              <Input value={kg} onChangeText={setKg} keyboardType="decimal-pad" />
            </>
          )}
          {stage && (
            <>
              <Label>{t('plant_harvests.note')}</Label>
              <Input value={note} onChangeText={setNote} placeholder={t('plant_harvests.note_placeholder')} multiline />
              <Button label={t('plant_harvests.save')} disabled={stage === 'on_tree' && !amount} onPress={save} />
            </>
          )}
        </Card>
      )}
      <View style={{ gap: space.sm }}>
        {pending.map((op) => (
          <HarvestRow key={op.id} notedOn={op.harvest.notedOn} stage={op.harvest.stage} amount={op.harvest.amount} uses={op.harvest.uses} kg={op.harvest.quantityKg} note={op.harvest.note} pending />
        ))}
        {(history?.harvests ?? []).slice(0, 6).map((h) => (
          <HarvestRow key={h.id} notedOn={h.notedOn} stage={h.stage} amount={h.amount} uses={h.uses} kg={h.quantityKg} note={h.note} author={h.author} />
        ))}
        {!online && !history && <Body muted>{t('mobile.feature.history_offline')}</Body>}
        {history && history.harvests.length === 0 && pending.length === 0 && <Body muted>{t('plant_harvests.empty')}</Body>}
      </View>
    </>
  )
}

function HarvestRow({ notedOn, stage, amount, uses, kg, note, author, pending }: {
  notedOn: string; stage: HarvestStage; amount: HarvestAmount | null; uses: HarvestUse[]; kg: number | null; note: string | null; author?: string | null; pending?: boolean
}) {
  const parts = [t(`plant_harvests.stages.${stage}`), amount ? t(`plant_harvests.amounts.${stage}.${amount}`) : null, kg ? t('plant_harvests.kg', { value: kg }) : null]
  return (
    <Card style={{ padding: space.md, gap: 2 }}>
      <Text style={s.rowTitle}>{parts.filter(Boolean).join(' · ')}</Text>
      {uses.length > 0 && <Body>{uses.map((u) => t(`plant_harvests.uses.${u}`)).join(', ')}</Body>}
      <Text style={s.rowMeta}>
        {[formatDate(notedOn), author ? t('plant_harvests.by', { name: author }) : null, pending ? t('mobile.feature.pending') : null].filter(Boolean).join(' · ')}
      </Text>
      {note ? <Body>{note}</Body> : null}
    </Card>
  )
}

const s = StyleSheet.create({
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  strip: { flexDirection: 'row', gap: space.md },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.loam500, borderStyle: 'dashed' },
  year: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
  rowTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.loam900 },
  rowMeta: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
})
