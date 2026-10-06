import { Download, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { strataLabel } from '@/components/plants/format'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { AlertsList } from '@/map/plants/AlertsList'
import { usePlanting } from '@/map/plants/store'
import { StrataDot } from '@/map/plants/strata'
import { TagFilter } from '@/map/tags/TagFilter'
import { tagCounts, UNTAGGED } from '@/map/tags/tags'
import { STRATA, type PlantListData, type PlantListRow } from '@/types/plants'

const EMPTY_LIST: PlantListData = { rows: [], total: 0, speciesCount: 0, lines: 0, planted: 0, placed: 0, unlinked: 0 }

type TagGroups = { groups: { tag: string; list: PlantListData }[]; untagged: PlantListData }

/** « Liste de plants »: what to order and plant, its exports, and the plan's coherence. */
export default function PlantListPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data, error } = usePlanting(mapId)
  const [tag, setTag] = useState<string | null>(null)
  const [byTag, setByTag] = useState(false)
  const tags = useMemo(
    () => tagCounts(editor.features.filter((f) => f.properties.layer === 'plants' && f.properties.status === 'active')),
    [editor.features],
  )
  const tagged = useTaggedList(mapId, data?.list, tag, byTag)
  if (error) return <p className="text-sm text-clay-500">{t('plant_list.load_error')}</p>
  if (!data) return <p className="text-sm text-loam-400">{t('common.loading')}</p>
  const list = (tag ? tagged.list : data.list) ?? EMPTY_LIST
  const groups = STRATA.map((strata) => ({ strata, rows: list.rows.filter((r) => r.strata === strata) })).filter((g) => g.rows.length)
  const query = tag == null ? '' : tag === UNTAGGED ? '?untagged=1' : `?tag=${encodeURIComponent(tag)}`

  return (
    <div className="space-y-5 text-sm">
      <p className="text-xs text-loam-500">{t('plant_list.intro')}</p>
      <TagFilter tags={tags} value={tag} onChange={(value) => { setTag(value); if (value) setByTag(false) }} grouped={byTag} onGroup={(on) => { setByTag(on); if (on) setTag(null) }} />
      {tagged.loading && <p className="text-xs text-loam-400">{t('common.loading')}</p>}
      {byTag && tagged.groups ? (
        <div className="space-y-4">
          {[...tagged.groups.groups, { tag: null, list: tagged.groups.untagged }].filter((g) => g.list.total > 0).map((g) => (
            <section key={g.tag ?? ''}>
              <h3 className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
                <span>{g.tag ?? t('tags.untagged')}</span>
                <span className="tabular-nums normal-case">{t('plant_list.totals', { total: g.list.total, species: g.list.speciesCount })}</span>
              </h3>
              <ul className="divide-y divide-loam-100">
                {g.list.rows.map((row) => <ListRow key={`${row.speciesId}-${row.varietyId ?? ''}`} row={row} />)}
              </ul>
            </section>
          ))}
        </div>
      ) : (<>
      {list.total > 0 && (
        <div>
          <p className="text-base font-semibold text-loam-900">{t('plant_list.totals', { total: list.total, species: list.speciesCount })}</p>
          <p className="mt-0.5 text-xs text-loam-500">
            {t('plant_list.isolated', { count: list.rows.reduce((s, r) => s + r.isolated, 0) })} · {t('plant_list.composed', { count: list.rows.reduce((s, r) => s + r.composed, 0) })} · {t('plant_list.planted', { count: list.planted })}
          </p>
        </div>
      )}
      {list.total === 0 ? (!tagged.loading &&
        <p className="rounded-lg border border-dashed border-loam-300 p-3 text-xs text-loam-500">{t(tag ? 'tags.no_match' : 'plant_list.empty')}</p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ strata, rows }) => (
            <div key={strata}>
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
                <StrataDot strata={strata} />{strataLabel(strata)}
              </h3>
              <ul className="divide-y divide-loam-100">
                {rows.map((row) => <ListRow key={`${row.speciesId}-${row.varietyId ?? ''}`} row={row} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
      </>)}
      {list.unlinked > 0 && <p className="text-xs text-humus-700">{t('plant_list.unlinked', { count: list.unlinked })}</p>}

      <div className="flex flex-wrap gap-2">
        <a
          href={`/maps/${mapId}/plant_list.csv${query}`} download aria-disabled={list.total === 0} tabIndex={list.total === 0 ? -1 : undefined}
          onClick={(e) => { if (list.total === 0) e.preventDefault() }}
          className={buttonClass('secondary', 'sm') + (list.total === 0 ? ' pointer-events-none opacity-50' : '')}
        >
          <Download className="h-4 w-4" />{t('plant_list.export_csv')}
        </a>
        <a href={`/maps/${mapId}/plant_list/print`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
          <Printer className="h-4 w-4" />{t('plant_list.print')}
        </a>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plant_list.coherence')}</h3>
        {data.zone == null && <p className="mb-2 text-xs text-loam-500">{t('plant_alerts.zone_unknown')}</p>}
        {data.alerts.alerts.length === 0
          ? <p className="text-xs text-leaf-700">{t('plant_list.coherence_none')}</p>
          : <AlertsList alerts={data.alerts.alerts} />}
      </section>
    </div>
  )
}

function ListRow({ row }: { row: PlantListRow }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-loam-800">{row.varietyName ? `${row.commonName ?? row.latinName} '${row.varietyName}'` : row.commonName ?? row.latinName}</p>
        <p className="truncate text-xs italic text-loam-500">{row.latinName}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums text-loam-900">{row.total}</p>
        <p className="text-[11px] text-loam-400" title={t('plant_list.split', { isolated: row.isolated, composed: row.composed })}>
          {row.composed > 0 && row.isolated > 0
            ? `${row.isolated} + ${row.composed}`
            : row.composed > 0 ? t('plant_list.in_patches', { count: row.total }) : t('plant_list.alone', { count: row.total })}
        </p>
      </div>
    </li>
  )
}

/**
 * The plant list narrowed to a tag, or one list per tag, read from the
 * server (the same addition as the whole list). Refreshed whenever the
 * planting changes.
 */
function useTaggedList(mapId: number, base: PlantListData | undefined, tag: string | null, byTag: boolean) {
  const [state, setState] = useState<{ list: PlantListData | null; groups: TagGroups | null; loading: boolean }>({ list: null, groups: null, loading: false })
  useEffect(() => {
    if (!tag && !byTag) { setState({ list: null, groups: null, loading: false }); return }
    const controller = new AbortController()
    const query = byTag ? 'group=tag' : tag === UNTAGGED ? 'untagged=1' : `tag=${encodeURIComponent(tag ?? '')}`
    setState((s) => ({ ...s, loading: true }))
    api<PlantListData | TagGroups>(`/maps/${mapId}/plant_list.json?${query}`, { signal: controller.signal })
      .then((data) => setState(byTag ? { list: null, groups: data as TagGroups, loading: false } : { list: data as PlantListData, groups: null, loading: false }))
      .catch(() => { if (!controller.signal.aborted) setState({ list: null, groups: null, loading: false }) })
    return () => controller.abort()
  }, [mapId, base, tag, byTag])
  return state
}
