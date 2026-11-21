// The card of « Tracer l'eau » in the 3D view: which work is in hand and
// what to do next while tracing (the level line under the cursor, the
// length, the radius), then the work as saved: its catchment, the rain that
// fills it, a rain to watch it fill, and the walk to make on the land after
// the next real downpour.

import clsx from 'clsx'
import { CloudRain, Footprints, Loader2, MapPin, Mountain, Spline, Undo2, Waves, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import type { MapFeature } from '@/types'
import type { DesignSummary } from './controller.ts'
import { formatDepth, formatNumber, formatSurface, formatVolume } from './format.ts'
import type { WaterSketch, WaterToolKind } from './waterTool.ts'

export const WATER_TOOL_KINDS: WaterToolKind[] = ['swale', 'pond', 'mound']

const ICONS = { swale: Spline, pond: Waves, mound: Mountain } as const

/** GET /maps/:id/relief/catchment?feature_id= (Relief::Catchment). */
export type CatchmentInfo = {
  geometry: GeoJSON.Geometry
  areaM2: number
  capacityM3: number | null
  fillRainMm: number | null
  annualRainM3: number | null
  emptiesInH: number | null
}

export type TracedResult = {
  feature: MapFeature
  kind: WaterToolKind
  /** Null for a mound (it holds no water), 'loading' while asked, 'failed' when the relief could not say. */
  catchment: CatchmentInfo | 'loading' | 'failed' | null
  /** The task « after the next heavy rain, go and see », when one was added. */
  rainCheck: { taskId: number; title: string } | null
}

/** The three tools, as pills: in the rain tab and on the card. */
export function WaterToolPicker({ value, onChange, disabled }: { value: WaterToolKind | null; onChange: (kind: WaterToolKind) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WATER_TOOL_KINDS.map((kind) => {
        const Icon = ICONS[kind]
        return (
          <Button
            key={kind}
            size="sm"
            variant={value === kind ? 'primary' : 'secondary'}
            disabled={disabled}
            aria-pressed={value === kind}
            onClick={() => onChange(kind)}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t(`relief.water_tool.kinds.${kind}`)}
          </Button>
        )
      })}
    </div>
  )
}

export function WaterToolCard({ mapId, kind, sketch, saving, result, designs, playing, onKind, onClose, onUndo, onRain, onRestart }: {
  mapId: number
  kind: WaterToolKind | null
  sketch: WaterSketch | null
  saving: boolean
  result: TracedResult | null
  designs: DesignSummary[]
  playing: boolean
  onKind: (kind: WaterToolKind) => void
  onClose: () => void
  /** Take the work back (to the trash, as on the map). */
  onUndo: () => void
  onRain: () => void
  /** The first click undone. */
  onRestart: () => void
}) {
  return (
    <div
      className="absolute inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 max-h-[42dvh] space-y-3 overflow-y-auto rounded-2xl border border-loam-200 bg-white/95 p-4 pr-10 text-sm text-loam-600 shadow-lg backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-24 sm:w-[24rem] sm:max-h-[calc(100%-7rem)] sm:overflow-y-auto"
      aria-live="polite"
    >
      <IconButton label={t('relief.water_tool.close')} size="sm" className="absolute right-1.5 top-1.5" onClick={onClose}>
        <X />
      </IconButton>
      {result
        ? <Traced mapId={mapId} result={result} designs={designs} playing={playing} onUndo={onUndo} onRain={onRain} />
        : <Tracing kind={kind} sketch={sketch} saving={saving} onKind={onKind} onRestart={onRestart} />}
    </div>
  )
}

function Tracing({ kind, sketch, saving, onKind, onRestart }: {
  kind: WaterToolKind | null; sketch: WaterSketch | null; saving: boolean; onKind: (kind: WaterToolKind) => void; onRestart: () => void
}) {
  const started = !!sketch?.anchor
  return (
    <>
      <div>
        <p className="font-serif text-lg text-loam-900">{t('relief.water_tool.title')}</p>
        <p className="mt-0.5 text-loam-500">{t('relief.water_tool.intro')}</p>
      </div>
      <WaterToolPicker value={kind} onChange={onKind} disabled={saving} />
      {kind && (
        <p className="rounded-xl bg-loam-50 px-3 py-2 text-loam-700">
          {saving
            ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('relief.water_tool.saving')}</span>
            : t(`relief.water_tool.steps.${kind}.${started ? 'end' : 'start'}`)}
        </p>
      )}
      {kind && sketch && !saving && <Measures sketch={sketch} />}
      {started && !saving && (
        <Button variant="ghost" size="sm" onClick={onRestart}>
          <Undo2 className="h-4 w-4" aria-hidden />
          {t('relief.water_tool.restart')}
        </Button>
      )}
    </>
  )
}

function Measures({ sketch }: { sketch: WaterSketch }) {
  if (sketch.flat) return <p className="text-humus-700">{t('relief.water_tool.flat')}</p>
  const items: string[] = []
  if (sketch.level != null) items.push(t('relief.water_tool.level', { altitude: formatNumber(sketch.level, 1) }))
  if (sketch.lengthM != null && sketch.lengthM >= 0.5) items.push(t('relief.water_tool.length', { length: formatNumber(sketch.lengthM) }))
  if (sketch.radiusM != null) items.push(t('relief.water_tool.diameter', { diameter: formatNumber(sketch.radiusM * 2, 1) }))
  if (sketch.areaM2 != null) items.push(formatSurface(sketch.areaM2))
  if (!items.length) return null
  return <p className="tabular-nums text-loam-700">{items.join(' · ')}</p>
}

function Traced({ mapId, result, designs, playing, onUndo, onRain }: {
  mapId: number; result: TracedResult; designs: DesignSummary[]; playing: boolean; onUndo: () => void; onRain: () => void
}) {
  const { feature, kind, catchment, rainCheck } = result
  const id = feature.properties.id
  const design = designs.find((d) => d.id === id)
  const fill = design && design.capacity >= 0.5 ? Math.min(1, design.water / design.capacity) : null
  return (
    <>
      <div>
        <p className="font-serif text-lg text-loam-900">{t(`relief.water_tool.done.${kind}`)}</p>
        <p className="mt-0.5 text-loam-500">{t('relief.water_tool.done.dug')}</p>
      </div>
      {catchment === 'loading' && (
        <p className="flex items-center gap-2 text-loam-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('relief.water_tool.catchment.loading')}</p>
      )}
      {catchment === 'failed' && <p className="text-loam-500">{t('relief.water_tool.catchment.failed')}</p>}
      {catchment && typeof catchment === 'object' && (
        <div className="space-y-1 rounded-xl bg-sky-50 px-3 py-2 text-loam-700">
          <p>{t('relief.water_tool.catchment.area', { area: formatSurface(catchment.areaM2) })}</p>
          {catchment.capacityM3 != null && catchment.fillRainMm != null && (
            <p>{t('relief.water_tool.catchment.fill', { capacity: formatVolume(catchment.capacityM3), rain: formatNumber(catchment.fillRainMm) })}</p>
          )}
          {catchment.annualRainM3 != null && <p className="text-loam-500">{t('relief.water_tool.catchment.year', { volume: formatVolume(catchment.annualRainM3) })}</p>}
        </div>
      )}
      {kind !== 'mound' && (
        <div className="space-y-2">
          <Button variant="leaf" size="sm" onClick={onRain}>
            <CloudRain className="h-4 w-4" aria-hidden />
            {playing ? t('relief.water_tool.rain_pause') : t('relief.water_tool.rain')}
          </Button>
          {fill != null && design && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-loam-100" role="progressbar" aria-valuenow={Math.round(fill * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className={clsx('h-full rounded-full bg-sky-500 transition-[width]')} style={{ width: `${fill * 100}%` }} />
              </div>
              <p className="mt-1 tabular-nums text-loam-500">
                {t('relief.water_tool.filled', { water: formatVolume(design.water), capacity: formatVolume(design.capacity), percent: Math.round(fill * 100) })}
              </p>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2 rounded-xl border border-dashed border-leaf-300 bg-leaf-50/60 px-3 py-2 text-loam-700">
        <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
        <div className="space-y-1">
          <p>{t(`relief.water_tool.outside.${kind}`, { depth: formatDepth(Number((feature.properties as Record<string, unknown>).depth_m ?? 0.4)) })}</p>
          {rainCheck && <p className="font-medium text-leaf-800">{t('relief.water_tool.rain_check', { title: rainCheck.title })}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/maps/${mapId}?feature=${id}`} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-prune-700 ring-1 ring-inset ring-prune-200 hover:bg-prune-50">
          <MapPin className="h-4 w-4" aria-hidden />
          {t('relief.water_tool.open_on_map')}
        </a>
        <Button variant="danger-ghost" size="sm" onClick={onUndo}>
          <Undo2 className="h-4 w-4" aria-hidden />
          {t('relief.water_tool.undo')}
        </Button>
      </div>
    </>
  )
}
