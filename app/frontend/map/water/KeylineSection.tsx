import { Loader2, Sprout } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { formatLength, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { installKeylinePreview } from '@/map/layers/keyline'
import { clampCount, DEFAULT_SPACING, MAX_PER_SIDE, parallelProperties, totalLength, useOf, type ParallelLine } from '@/map/water/keyline'
import type { MapFeature } from '@/types'

export function appliesToKeyline(feature: MapFeature): boolean {
  return feature.properties.kind === 'keyline' && feature.properties.status !== 'rejected' && feature.geometry?.type === 'LineString'
}

type State = { status: 'loading' } | { status: 'ready'; lines: ParallelLine[] } | { status: 'error'; message: string; reason?: string }

/**
 * Inspector section of a keyline: what its use will do over the years and,
 * from the keyline itself, the lines parallel to it above and below,
 * previewed on the map before they are added.
 */
export default function KeylineSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const p = feature.properties
  const use = useOf(p.use)
  const isKeyline = p.role !== 'parallel'
  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
        <Sprout className="h-4 w-4 text-leaf-600" />
        {t(isKeyline ? 'relief.parallels.title' : 'relief.parallels.title_parallel')}
      </h3>
      <p className="text-sm text-loam-600">{t(isKeyline ? 'relief.parallels.intro' : 'relief.parallels.intro_parallel')}</p>
      <p className="text-sm text-loam-600">{t(`relief.parallels.time.${use}`)}</p>
      {isKeyline && editor.entitlements.analyses && <Parallels feature={feature} />}
    </section>
  )
}

function Parallels({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const p = feature.properties
  const [spacing, setSpacing] = useState(String(DEFAULT_SPACING[useOf(p.use)]))
  const [above, setAbove] = useState('2')
  const [below, setBelow] = useState('2')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(0)
  const use = useOf(p.use)
  // A new use brings its usual spacing.
  useEffect(() => setSpacing(String(DEFAULT_SPACING[use])), [use])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setAdded(0)
      setState({ status: 'loading' })
      const query = new URLSearchParams({
        feature_id: String(p.id), spacing_m: spacing.replace(',', '.'), above: String(clampCount(above)), below: String(clampCount(below)),
      })
      api<{ lines: ParallelLine[] }>(`/maps/${editor.map.id}/relief/parallels?${query}`, { signal: controller.signal })
        .then(({ lines }) => setState({ status: 'ready', lines }))
        .catch((error) => {
          if (controller.signal.aborted) return
          const reason = error instanceof ApiError ? (error.data.reason as string | undefined) : undefined
          setState({ status: 'error', message: (error as Error).message, reason })
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [editor.map.id, p.id, p.lockVersion, spacing, above, below])

  const lines = state.status === 'ready' ? state.lines : null
  useEffect(() => {
    if (!lines?.length) return
    return installKeylinePreview(editor.instance, 'parallels', lines.map((line) => ({ type: 'Feature', geometry: line.geometry, properties: { role: 'parallel' } })))
  }, [editor.instance, lines])

  async function add() {
    if (!lines?.length) return
    setAdding(true)
    try {
      for (const line of lines) {
        await editor.createFeature({ layer: 'water', kind: 'keyline', geometry: line.geometry, properties: parallelProperties(p), tags: p.tags ?? undefined })
      }
      editor.notify(t('relief.parallels.added', { count: lines.length }))
      setAdded(lines.length)
      setState({ status: 'ready', lines: [] })
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const missing = (['above', 'below'] as const).filter((side) =>
    clampCount(side === 'above' ? above : below) > 0 && lines != null && lines.length > 0 && !lines.some((line) => line.side === side))
  const fall = lines?.reduce((max, line) => Math.max(max, line.fallM ?? 0), 0) ?? 0
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label={t('relief.parallels.spacing')}>
          <Input type="number" inputMode="decimal" min={1} max={100} step={1} value={spacing} onChange={(e) => setSpacing(e.target.value)} />
        </Field>
        <Field label={t('relief.parallels.above')}>
          <Input type="number" inputMode="numeric" min={0} max={MAX_PER_SIDE} step={1} value={above} onChange={(e) => setAbove(e.target.value)} />
        </Field>
        <Field label={t('relief.parallels.below')}>
          <Input type="number" inputMode="numeric" min={0} max={MAX_PER_SIDE} step={1} value={below} onChange={(e) => setBelow(e.target.value)} />
        </Field>
      </div>
      {state.status === 'loading' && (
        <p className="flex items-center gap-1.5 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" />{t('relief.parallels.loading')}</p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-loam-600">
          {state.message}
          {state.reason === 'no_relief' && (
            <button type="button" onClick={() => editor.openPanel('relief')} className="ml-1 text-prune-700 underline-offset-2 hover:underline">
              {t('relief.catchment.open_relief')}
            </button>
          )}
        </p>
      )}
      {lines && lines.length > 0 && (
        <>
          <p className="text-sm text-loam-700">
            {t('relief.parallels.summary', { count: lines.length, length: formatLength(totalLength(lines)) })}{' '}
            {fall < 0.1 ? t('relief.parallels.even') : t('relief.parallels.fall', { fall: formatNumber(fall) })}
          </p>
          {missing.map((side) => <p key={side} className="text-sm text-loam-500">{t(`relief.parallels.no_${side}`)}</p>)}
          {editor.canEdit && (
            <Button size="sm" onClick={add} disabled={adding}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('relief.parallels.add', { count: lines.length })}
            </Button>
          )}
        </>
      )}
      {lines && lines.length === 0 && (
        <p className="text-sm text-loam-500">{added ? t('relief.parallels.added', { count: added }) : t('relief.parallels.none')}</p>
      )}
    </div>
  )
}
