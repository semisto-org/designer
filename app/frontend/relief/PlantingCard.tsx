import clsx from 'clsx'
import { Loader2, Sprout, X } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import type { PaletteItem } from '@/types/plants'
import type { CarryInfo } from './controller.ts'
import type { FitCheck, FitLevel, PlantFit } from './plantFit.ts'

/** The plant tool of the 3D view: choosing a plant, then carrying it to its place. */
export type PlantTool =
  | { step: 'choose' }
  | { step: 'carry'; mode: 'place' | 'move'; name: string; item: PaletteItem | null; featureId: number | null; info: CarryInfo | null }

/** The last plant put down, while the spot asks to be checked on the land. */
export type LastPlanted = { featureId: number; name: string; fit: PlantFit }

const LEVEL_TONE: Record<FitLevel, string> = {
  good: 'bg-leaf-100 text-leaf-800',
  fair: 'bg-humus-100 text-humus-800',
  poor: 'bg-clay-100 text-clay-700',
  unknown: 'bg-prune-100 text-prune-700',
}
const NOTE_DOT = { good: 'bg-leaf-600', warn: 'bg-humus-500', bad: 'bg-clay-500' }

export function FitSummary({ fit }: { fit: PlantFit }) {
  return (
    <div className="space-y-1">
      <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold', LEVEL_TONE[fit.level])}>
        {t(`relief.planting.fit.${fit.level}`)}
      </span>
      <ul className="space-y-0.5">
        {fit.notes.map((note) => (
          <li key={note.key} className="flex items-start gap-2 text-sm text-loam-700">
            <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', NOTE_DOT[note.tone])} />
            {t(`relief.planting.fit.${note.key}`)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What to go and see, and when, for a spot the model is unsure of. */
export function checksText(checks: FitCheck[]): string {
  return checks.map((check) => t(`relief.planting.check.${check}`)).join(', ')
}

export function PlantingCard({ mapId, tool, palette, loading, touch, yearLabel, stationReady, last, onChoose, onStop, onAddCheck }: {
  mapId: number
  tool: PlantTool
  palette: PaletteItem[] | null
  loading: boolean
  touch: boolean
  yearLabel: string
  stationReady: boolean
  last: LastPlanted | null
  onChoose: (item: PaletteItem) => void
  onStop: () => void
  onAddCheck: (last: LastPlanted) => void
}) {
  return (
    <div
      className={clsx(
        'absolute z-30 max-h-[60dvh] space-y-3 overflow-y-auto rounded-2xl border border-loam-200 bg-white/95 p-3 text-sm text-loam-600 shadow-lg backdrop-blur',
        'inset-x-3 top-3 sm:inset-x-auto sm:left-1/2 sm:top-3 sm:w-[26rem] sm:-translate-x-1/2',
      )}
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" />
        <p className="min-w-0 flex-1 font-semibold text-loam-900">
          {tool.step === 'choose'
            ? t('relief.planting.choose')
            : t(tool.mode === 'move'
              ? (touch ? 'relief.planting.moving_touch' : 'relief.planting.moving')
              : (touch ? 'relief.planting.placing_touch' : 'relief.planting.placing'), { name: tool.name })}
        </p>
        <IconButton size="sm" label={t('relief.planting.close')} onClick={onStop}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      {tool.step === 'choose' && (
        loading && !palette ? (
          <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('relief.planting.loading')}</p>
        ) : !palette?.length ? (
          <div className="space-y-2">
            <p>{t('relief.planting.palette_empty')}</p>
            <ButtonLink href={`/maps/${mapId}?panel=palette`} variant="secondary" size="sm">{t('relief.planting.open_palette')}</ButtonLink>
          </div>
        ) : (
          <>
            <p>{t('relief.planting.choose_hint')}</p>
            <ul className="divide-y divide-loam-100">
              {palette.map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-loam-900">{item.name}</span>
                    <span className="block text-loam-500">{t(`plants.strata.${item.effectiveStrata}`)}</span>
                  </span>
                  <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onChoose(item)}>{t('relief.planting.pick')}</Button>
                </li>
              ))}
            </ul>
          </>
        )
      )}

      {tool.step === 'carry' && (
        <>
          {tool.info ? <FitSummary fit={tool.info.fit} /> : !stationReady && (
            <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('relief.planting.reading_station')}</p>
          )}
          <p className="text-loam-500">{t('relief.planting.year_hint', { year: yearLabel })} {t('relief.planting.shadow_hint')}</p>
          {tool.info && tool.info.fit.level !== 'unknown' && <p className="text-loam-500">{t('relief.planting.fit.model')}</p>}
          <Button size="sm" variant="secondary" className="w-full" onClick={onStop}>{t('relief.planting.stop')}</Button>
        </>
      )}

      {last && last.fit.checks.length > 0 && (
        <div className="space-y-2 rounded-xl bg-leaf-50 p-2.5">
          <p className="font-semibold text-leaf-800">{t('relief.planting.check.title')} · {last.name}</p>
          <p className="text-loam-700">{checksText(last.fit.checks)}</p>
          <Button size="sm" variant="secondary" onClick={() => onAddCheck(last)}>{t('relief.planting.check.add')}</Button>
        </div>
      )}
    </div>
  )
}
