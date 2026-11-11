import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, BookOpen, Layers, Lock, Plus, Sparkles, X } from 'lucide-react'
import type { MapMouseEvent } from 'maplibre-gl'
import type { Geometry } from 'geojson'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ChipButton } from '@/components/ui/ChipButton'
import { CompanionEmpty } from '@/components/ui/Companion'
import { CopyField } from '@/components/CopyField'
import { Flash } from '@/components/ui/Flash'
import { Select } from '@/components/ui/Field'
import { confirmAction } from '@/components/ui/confirm'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import { useMapInstance } from '@/map/MapContext'
import { MapView } from '@/map/MapView'
import { installBoundary } from '@/map/layers/boundary'
import { syncRegionLayers } from '@/map/layers/region'
import { formatKm2 } from '@/territories/format'
import { ItemCard } from '@/territories/ItemCard'
import { ItemForm } from '@/territories/ItemForm'
import { ITEM_LAYER_IDS, installTeamMaps, installTerritoryItems, type MapItem } from '@/territories/layers'
import type { RegionLayerData } from '@/types'
import type { TerritoryItemKind, TerritoryShowProps } from '@/types/territories'

const TABS: TerritoryItemKind[] = ['actor', 'source', 'expectation', 'basin', 'marker', 'lead', 'request']
const TAB_KEYS: Record<TerritoryItemKind, string> = { actor: 'actors', source: 'sources', expectation: 'expectations', basin: 'basins', marker: 'markers', lead: 'leads', request: 'requests' }
const RANK_ORDER = ['soil', 'slow', 'structure']

/** A territory: the commune read on the map, and its dossier on the side. */
export default function TerritoryShow(props: TerritoryShowProps) {
  const { territory, items, canEdit } = props
  const initialTab = (new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('tab') ?? 'actor') as TerritoryItemKind
  const [tab, setTab] = useState<TerritoryItemKind>(TABS.includes(initialTab) ? initialTab : 'actor')
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [placing, setPlacing] = useState<((g: Geometry | null) => void) | null>(null)
  const [layersOpen, setLayersOpen] = useState(false)

  const drafts = items.filter((item) => item.status === 'draft')
  const proposals = items.filter((item) => item.status === 'active' && item.pendingUpdate)
  const byKind = (kind: TerritoryItemKind) => {
    const list = items.filter((item) => item.kind === kind && item.status === 'active')
    if (kind === 'lead') return [...list].sort((a, b) => RANK_ORDER.indexOf(a.properties.rank ?? '') - RANK_ORDER.indexOf(b.properties.rank ?? ''))
    if (kind === 'basin') return [...list].sort((a, b) => (a.properties.order ?? Infinity) - (b.properties.order ?? Infinity))
    return list
  }
  const sources = items.filter((item) => item.kind === 'source' && item.status !== 'rejected')
  const expectations = items.filter((item) => item.kind === 'expectation' && item.status !== 'rejected')
  const basins = items.filter((item) => item.kind === 'basin' && item.status !== 'rejected')
    .sort((a, b) => (a.properties.order ?? Infinity) - (b.properties.order ?? Infinity))
  const actors = items.filter((item) => item.kind === 'actor' && item.status !== 'rejected')
  const titles = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items])

  const place = useCallback((done: (g: Geometry | null) => void) => setPlacing(() => done), [])
  const select = (id: number) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    setSelected(id)
    if (item.status === 'active' && item.kind !== tab) setTab(item.kind)
    requestAnimationFrame(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const archive = async () => {
    if (await confirmAction({ title: t('territories.show.archive_confirm.title', { name: territory.name }), body: t('territories.show.archive_confirm.body'), confirmLabel: t('territories.show.archive') })) {
      router.post(`/territories/${territory.id}/archive`)
    }
  }

  const list = byKind(tab)
  return (
    <div className="fixed inset-0 flex flex-col overflow-clip overscroll-none bg-loam-100 md:flex-row">
      <Head title={territory.name} />
      <Flash />
      <div className="relative h-[45dvh] shrink-0 md:h-auto md:min-w-0 md:flex-1">
        <MapView className="absolute inset-0" center={territory.center} bbox={territory.bbox}>
          <TerritoryLayers {...props} selected={selected} onSelect={select} placing={placing} onPlaced={(g) => { placing?.(g); setPlacing(null) }} layersOpen={layersOpen} />
        </MapView>
        <div className="absolute left-2 top-2 z-10 flex gap-2">
          <Link href="/territories" className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-loam-800 shadow ring-1 ring-loam-200">
            <ArrowLeft className="h-4 w-4" aria-hidden />{t('territories.show.back')}
          </Link>
          <Button size="sm" variant="secondary" className="shadow" onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen}>
            <Layers className="h-4 w-4" aria-hidden />{t('territories.show.map.layers_title')}
          </Button>
        </div>
        {placing && (
          <div className="absolute inset-x-2 bottom-8 z-10 mx-auto flex w-fit max-w-full items-center gap-3 rounded-full bg-loam-900/90 px-4 py-1.5 text-sm text-white shadow" role="status">
            {t('territories.show.map.place')}
            <Button size="sm" variant="secondary" onClick={() => { placing(null); setPlacing(null) }}>{t('territories.show.map.place_cancel')}</Button>
          </div>
        )}
      </div>

      <aside className="min-h-0 flex-1 overflow-y-auto bg-white md:w-[30rem] md:flex-none md:border-l md:border-loam-200">
        <header className="border-b border-loam-100 px-5 pb-4 pt-5">
          <h1 className="text-3xl">{territory.name}</h1>
          <p className="mt-1 text-sm text-loam-500">{t('territories.show.area', { area: formatKm2(territory.areaM2), team: territory.teamName })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/territories/${territory.id}/notebook`} size="sm"><BookOpen className="h-4 w-4" aria-hidden />{t('territories.show.notebook')}</ButtonLink>
            {canEdit && <Button size="sm" variant="ghost" onClick={archive}>{t('territories.show.archive')}</Button>}
            {territory.archived && props.moduleGranted && (
              <Button size="sm" variant="secondary" onClick={() => router.post(`/territories/${territory.id}/unarchive`)}>{t('territories.show.unarchive')}</Button>
            )}
            {!canEdit && <Pill icon={<Lock aria-hidden />}>{t('territories.show.read_only')}</Pill>}
          </div>
          {territory.archived && <p className="mt-3 rounded-lg bg-loam-50 p-3 text-sm text-loam-700">{t('territories.show.archived_note')}</p>}
          {!territory.archived && !props.moduleGranted && <p className="mt-3 rounded-lg bg-humus-50 p-3 text-sm text-humus-800">{t('territories.show.module_off_note')}</p>}
        </header>

        {drafts.length > 0 && (
          <section className="border-b border-loam-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg"><Sparkles className="h-4 w-4 text-humus-600" aria-hidden />{t('territories.show.drafts.title', { count: drafts.length })}</h2>
            <p className="mt-1 text-sm text-loam-600">{t('territories.show.drafts.why')}</p>
            <ul className="mt-3 grid gap-3">
              {drafts.map((item) => editing === item.id
                ? <li key={item.id}><ItemForm territoryId={territory.id} kind={item.kind} item={item} sources={sources} expectations={expectations} basins={basins} actors={actors} place={place} onDone={() => setEditing(null)} /></li>
                : <ItemCard key={item.id} item={item} territoryId={territory.id} canEdit={canEdit} selected={selected === item.id} onEdit={() => setEditing(item.id)} onSelect={() => select(item.id)} titles={titles} />)}
            </ul>
          </section>
        )}

        {proposals.length > 0 && (
          <section className="border-b border-loam-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg"><Sparkles className="h-4 w-4 text-humus-600" aria-hidden />{t('territories.show.updates.title', { count: proposals.length })}</h2>
            <p className="mt-1 text-sm text-loam-600">{t('territories.show.updates.why')}</p>
            <ul className="mt-3 grid gap-3">
              {proposals.map((item) => (
                <ItemCard key={item.id} item={item} territoryId={territory.id} canEdit={canEdit} selected={selected === item.id} onEdit={() => setEditing(item.id)} onSelect={() => select(item.id)} titles={titles} review />
              ))}
            </ul>
          </section>
        )}

        <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-loam-100 bg-white px-4 py-2" aria-label={t('territories.show.notebook')}>
          {TABS.map((kind) => {
            const count = byKind(kind).length
            return (
              <ChipButton key={kind} pressed={tab === kind} className="shrink-0 whitespace-nowrap" onClick={() => { setTab(kind); setEditing(null) }}>
                {t(`territories.show.tabs.${TAB_KEYS[kind]}`)}{count > 0 ? ` · ${count}` : ''}
              </ChipButton>
            )
          })}
        </nav>

        <section className="px-5 py-4">
          {tab === 'source' && <ResearchGrid {...props} />}
          {canEdit && editing !== 'new' && (
            <Button size="sm" variant="secondary" className="mb-3" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden />{t('territories.show.add')}</Button>
          )}
          {editing === 'new' && (
            <div className="mb-3"><ItemForm territoryId={territory.id} kind={tab} sources={sources} expectations={expectations} basins={basins} actors={actors} place={place} onDone={() => setEditing(null)} /></div>
          )}
          {list.length === 0 && editing !== 'new' ? (
            <CompanionEmpty title={t(`territories.show.empty.${TAB_KEYS[tab]}.title`)} why={t(`territories.show.empty.${TAB_KEYS[tab]}.why`)} />
          ) : (
            <ul className="grid gap-3">
              {list.map((item) => editing === item.id
                ? <li key={item.id}><ItemForm territoryId={territory.id} kind={item.kind} item={item} sources={sources} expectations={expectations} basins={basins} actors={actors} place={place} onDone={() => setEditing(null)} /></li>
                : <ItemCard key={item.id} item={item} territoryId={territory.id} canEdit={canEdit} selected={selected === item.id} onEdit={() => setEditing(item.id)} onSelect={() => select(item.id)} titles={titles} />)}
            </ul>
          )}
          {tab === 'lead' && (
            <div className="mt-5 grid gap-2 text-sm text-loam-600">
              <p className="flex items-center gap-2"><span className="inline-block h-4 w-4 rounded-full bg-leaf-500/40 blur-[2px]" aria-hidden />{t('territories.show.map.legend_fuzzy')}</p>
              <p className="flex items-center gap-2"><span className="inline-block h-4 w-4 rounded-sm border-2 border-leaf-600 bg-leaf-500/25" aria-hidden />{t('territories.show.map.legend_sharp')}</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}

function ResearchGrid({ territory, researchGrid }: TerritoryShowProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4 rounded-2xl bg-prune-50 p-4 ring-1 ring-prune-100">
      <h3 className="flex items-center gap-2 font-medium text-prune-900"><Sparkles className="h-4 w-4" aria-hidden />{t('territories.show.research.title')}</h3>
      <p className="mt-1 text-sm text-loam-700">{t('territories.show.research.why')}</p>
      <p className="mt-3 text-sm font-medium text-loam-700">{t('territories.show.research.prompt')}</p>
      <CopyField className="mt-1" value={t('territories.show.research.prompt_text', { name: territory.name })} />
      {researchGrid.length > 0 && (
        <>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}{t('territories.show.research.title')}
          </Button>
          {open && (
            <ul className="mt-2 grid gap-2 text-sm">
              {researchGrid.map((topic) => (
                <li key={topic.topic} className="rounded-xl bg-white p-3 ring-1 ring-prune-100">
                  <p className="font-medium text-loam-900">{topic.topic}</p>
                  {topic.why && <p className="mt-0.5 text-loam-600">{topic.why}</p>}
                  {topic.where && topic.where.length > 0 && <p className="mt-1 text-loam-500">{topic.where.join(' · ')}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/** The commune on the map: the region's layers, its boundary, the team's maps and the dossier. */
function TerritoryLayers({ territory, items, layers, teamMaps, selected, onSelect, placing, onPlaced, layersOpen }: TerritoryShowProps & {
  selected: number | null
  onSelect: (id: number) => void
  placing: ((g: Geometry | null) => void) | null
  onPlaced: (g: Geometry) => void
  layersOpen: boolean
}) {
  const instance = useMapInstance()
  const bases = layers.filter((layer) => layer.category === 'base')
  const overlays = layers.filter((layer) => layer.category === 'overlay')
  const photos = bases.filter((layer) => layer.kind !== 'style')
  const [base, setBase] = useState<string | null>(() => (photos.find((l) => l.options.default === true) ?? photos[photos.length - 1] ?? bases[0])?.key ?? null)
  const [shown, setShown] = useState<string[]>(() => overlays.filter((l) => l.options.territory_default === true).map((l) => l.key))
  const [showTeamMaps, setShowTeamMaps] = useState(true)

  useEffect(() => {
    if (!instance) return
    syncRegionLayers(instance, layers, { base, overlays: shown, opacity: {}, bounds: territory.region?.bounds ?? null }, () => undefined)
  }, [instance, layers, base, shown, territory.region])

  const framed = useRef(false)
  useEffect(() => {
    if (!instance || framed.current) return
    framed.current = true
    instance.resize()
    instance.fitBounds(territory.bbox, { padding: 40, duration: 0 })
  }, [instance, territory.bbox])

  const mapItems: MapItem[] = useMemo(() => items
    .filter((item) => item.geometry && (item.kind === 'marker' || item.kind === 'lead' || item.kind === 'basin'))
    .map((item) => ({ id: item.id, kind: item.kind as MapItem['kind'], status: item.status, geometry: item.geometry as Geometry, proof: item.properties.proof, sharp: item.sharp, title: item.title })), [items])

  useEffect(() => {
    if (!instance) return
    const apply = () => {
      installBoundary(instance, territory.boundary)
      installTeamMaps(instance, teamMaps, showTeamMaps)
      installTerritoryItems(instance, mapItems, selected)
    }
    // The children mount once the style is loaded; tiles still loading
    // (isStyleLoaded() is then false) do not stop sources from being added.
    apply()
  }, [instance, territory.boundary, teamMaps, showTeamMaps, mapItems, selected])

  // A click picks an entry, or places the one being edited.
  const placingRef = useRef(placing)
  placingRef.current = placing
  const handlers = useRef({ onSelect, onPlaced })
  handlers.current = { onSelect, onPlaced }
  useEffect(() => {
    if (!instance) return
    const click = (event: MapMouseEvent) => {
      if (placingRef.current) {
        handlers.current.onPlaced({ type: 'Point', coordinates: [event.lngLat.lng, event.lngLat.lat] })
        return
      }
      const ids = ITEM_LAYER_IDS.filter((id) => instance.getLayer(id))
      const hit = instance.queryRenderedFeatures(event.point, { layers: ids })[0]
      const id = hit?.properties?.id
      if (typeof id === 'number') handlers.current.onSelect(id)
    }
    instance.on('click', click)
    return () => { instance.off('click', click) }
  }, [instance])

  useEffect(() => {
    if (!instance) return
    instance.getCanvas().style.cursor = placing ? 'crosshair' : ''
  }, [instance, placing])

  if (!layersOpen) return null
  const groups = overlays.reduce<Record<string, RegionLayerData[]>>((acc, layer) => {
    const key = layer.group ?? 'other'
    ;(acc[key] ??= []).push(layer)
    return acc
  }, {})
  const groupLabel = (key: string) => {
    const label = t(`territories.show.map.groups.${key}`)
    return label.startsWith('territories.') ? t('territories.show.map.groups.other') : label
  }
  return (
    <div className="absolute left-2 top-14 z-10 max-h-[calc(100%-5rem)] w-72 overflow-y-auto rounded-2xl bg-white/95 p-3 text-sm shadow-lg ring-1 ring-loam-200">
      <p className="font-medium text-loam-900">{t('territories.show.map.base')}</p>
      <Select className="mt-1" value={base ?? ''} onChange={(e) => setBase(e.target.value || null)}>
        {bases.map((layer) => <option key={layer.key} value={layer.key}>{layer.name}</option>)}
      </Select>
      {Object.entries(groups).map(([group, list]) => (
        <div key={group} className="mt-3">
          <p className="font-medium text-loam-900">{groupLabel(group)}</p>
          <div className="mt-1 grid gap-1">
            {list.map((layer) => (
              <label key={layer.key} className={clsx('flex items-start gap-2', shown.includes(layer.key) ? 'text-loam-900' : 'text-loam-600')}>
                <input type="checkbox" className="mt-0.5" checked={shown.includes(layer.key)}
                  onChange={(e) => setShown((s) => e.target.checked ? [...s, layer.key] : s.filter((k) => k !== layer.key))} />
                {layer.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      {teamMaps.length > 0 && (
        <div className="mt-3">
          <label className="flex items-center gap-2 font-medium text-loam-900">
            <input type="checkbox" checked={showTeamMaps} onChange={(e) => setShowTeamMaps(e.target.checked)} />
            {t('territories.show.map.team_maps')}
          </label>
          <ul className="mt-1 grid gap-0.5 pl-6">
            {teamMaps.map((map) => <li key={map.id}><Link href={`/maps/${map.id}`} className="text-prune-700 hover:underline">{map.name}</Link></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
