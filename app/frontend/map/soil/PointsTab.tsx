import clsx from 'clsx'
import { ChevronDown, FlaskConical, Loader2, MapPin, MapPinOff, Plus, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { formatArea, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { visiblePadding } from '@/map/visiblePadding'
import { formatDate } from '@/map/soil/format'
import SampleEditor from '@/map/soil/SampleEditor'
import { soilActions, useSoil } from '@/map/soil/store'
import type { SoilSampleData } from '@/types/soil_photos'

const COUNTS = [3, 4, 5, 6, 8, 10, 12, 15, 20]

/** The sampling points: suggested positions, the list, and the form of the open point. */
export default function PointsTab() {
  const editor = useEditor()
  const state = useSoil()
  const [suggesting, setSuggesting] = useState(state.suggestions != null)
  const sampled = state.samples.filter((s) => s.status === 'sampled').length

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('soil.points.intro')}</p>

      {editor.canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setSuggesting(true)} disabled={suggesting}>
            <Sparkles className="h-4 w-4" aria-hidden />
            {t('soil.points.suggest')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => soilActions.startPlacing({ kind: 'new-sample' })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('soil.points.add')}
          </Button>
        </div>
      ) : (
        <p className="rounded-lg bg-loam-50 p-3 text-xs text-loam-500">{t('soil.points.read_only')}</p>
      )}

      {suggesting && editor.canEdit && <SuggestionsBox onDone={() => setSuggesting(false)} />}

      {state.loading && !state.loaded ? (
        <p className="flex items-center gap-2 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('soil.panel.loading')}</p>
      ) : state.samples.length === 0 ? (
        <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-500">{t('soil.points.empty')}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-loam-500">
            {t('soil.points.count', { count: state.samples.length })}
            {sampled > 0 ? ` · ${t('soil.points.sampled_count', { count: sampled })}` : ''}
          </p>
          <ul className="space-y-2">
            {state.samples.map((sample) => <SampleItem key={sample.id} sample={sample} open={state.openId === sample.id} />)}
          </ul>
        </div>
      )}
    </div>
  )
}

function SampleItem({ sample, open }: { sample: SoilSampleData; open: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  const resultCount = Object.keys(sample.results).length
  const located = sample.lng != null && sample.lat != null

  // A marker clicked on the map opens its point: bring it into view.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  return (
    <li ref={ref} className={clsx('overflow-hidden rounded-xl border bg-white', open ? 'border-leaf-300' : 'border-loam-100')}>
      <button
        type="button" aria-expanded={open} aria-label={`${t('soil.sample.open')} : ${sample.label}`}
        onClick={() => soilActions.openSample(open ? null : sample.id)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-loam-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-prune-600"
      >
        <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 ring-inset', sample.status === 'sampled' ? 'bg-leaf-500 text-white ring-leaf-500' : 'bg-white text-leaf-600 ring-leaf-500')}>
          <FlaskConical className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-loam-900">{sample.label}</span>
          <span className="block text-xs text-loam-500">
            {[
              sample.status === 'sampled' && sample.sampledOn ? t('soil.points.sampled_on', { date: formatDate(sample.sampledOn) }) : t(`soil.points.status.${sample.status}`),
              t('soil.points.depth', { from: sample.depthFromCm, to: sample.depthToCm }),
              resultCount > 0 ? t('soil.points.results_count', { count: resultCount }) : null,
            ].filter(Boolean).join(' · ')}
          </span>
        </span>
        {located
          ? <MapPin className="h-4 w-4 shrink-0 text-loam-400" aria-hidden />
          : <span title={t('soil.points.not_placed')}><MapPinOff className="h-4 w-4 shrink-0 text-humus-500" aria-label={t('soil.points.not_placed')} /></span>}
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-loam-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <SampleEditor sample={sample} onClose={() => soilActions.openSample(null)} />}
    </li>
  )
}

/** Asks for suggested positions, shows them on the map (numbered), and turns the accepted ones into points. */
function SuggestionsBox({ onDone }: { onDone: () => void }) {
  const editor = useEditor()
  const { suggestions, suggestionMeta } = useSoil()
  const [count, setCount] = useState(suggestionMeta?.wanted ?? 5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasBoundary = editor.map.boundary != null

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const data = await soilActions.suggest(editor.map.id, count)
      if (data.points.length > 0) {
        const bounds = data.points.reduce<[number, number, number, number]>(
          (b, p) => [Math.min(b[0], p.lng), Math.min(b[1], p.lat), Math.max(b[2], p.lng), Math.max(b[3], p.lat)],
          [Infinity, Infinity, -Infinity, -Infinity],
        )
        editor.instance.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: visiblePadding(true, 70), maxZoom: 18, duration: 500 })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function accept() {
    setBusy(true)
    try {
      const added = await soilActions.acceptSuggestions(editor.map.id)
      editor.notify(t('soil.suggestions.added', { count: added.length }))
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    soilActions.clearSuggestions()
    onDone()
  }

  const found = suggestions?.length ?? 0
  return (
    <section className="space-y-3 rounded-xl bg-prune-50 p-3.5" aria-label={t('soil.suggestions.title')}>
      <div>
        <h3 className="text-sm font-semibold text-prune-900">{t('soil.suggestions.title')}</h3>
        <p className="text-xs text-prune-800">{t('soil.suggestions.hint')}</p>
      </div>

      {!hasBoundary ? (
        <p className="text-sm text-humus-700">{t('soil.suggestions.needs_boundary')}</p>
      ) : (
        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="block text-xs font-medium text-prune-800">{t('soil.suggestions.count')}</span>
            <Select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
              {COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
          <Button size="sm" onClick={run} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? t('soil.suggestions.running') : t('soil.suggestions.run')}
          </Button>
        </div>
      )}

      {suggestions != null && suggestionMeta && (
        <div className="space-y-2 text-sm text-prune-900" role="status">
          {found === 0 ? (
            <p>{t('soil.suggestions.none')}</p>
          ) : (
            <>
              <p>
                {t('soil.suggestions.result', {
                  count: found, area: formatArea(suggestionMeta.usableAreaM2), edge: suggestionMeta.edgeMargin, obstacle: suggestionMeta.obstacleMargin,
                })}
              </p>
              {found < suggestionMeta.wanted && <p className="text-xs text-prune-700">{t('soil.suggestions.fewer', { found, wanted: suggestionMeta.wanted })}</p>}
            </>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-clay-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {found > 0 && <Button size="sm" onClick={accept} disabled={busy}>{t('soil.suggestions.accept')}</Button>}
        <Button size="sm" variant="secondary" onClick={cancel} disabled={busy}>{t('soil.suggestions.cancel')}</Button>
      </div>
    </section>
  )
}
