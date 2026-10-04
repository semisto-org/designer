// The Niva on the relief page: the panel section (take it, lights, night,
// camera), the dashboard over the scene and the touch pad.
import clsx from 'clsx'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CarFront, Hand } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { NivaInfo, NivaKey } from './controller.ts'
import { formatNumber } from './format.ts'
import type { NivaLights } from './nivaModel.ts'
import type { CameraMode } from './scene.ts'
import { ChoiceGroup, SectionTitle, Toggle } from './ui.tsx'

export type NivaSettings = { lights: NivaLights; night: boolean; camera: CameraMode }

export function NivaSection({ info, settings, onToggle, onMove, onLight, onNight, onCamera }: {
  info: NivaInfo
  settings: NivaSettings
  onToggle: () => void
  onMove: () => void
  onLight: (which: keyof NivaLights, on: boolean) => void
  onNight: (on: boolean) => void
  onCamera: (mode: CameraMode) => void
}) {
  const driving = info.mode === 'driving'
  return (
    <div className="space-y-2 border-t border-loam-100 pt-3">
      <SectionTitle>{t('relief.page.niva.title')}</SectionTitle>
      <p className="text-xs text-loam-500">{t('relief.page.niva.intro')}</p>
      <div className="flex gap-2">
        <Button variant={info.mode === 'off' ? 'secondary' : 'primary'} size="sm" className="flex-1 whitespace-nowrap text-xs" onClick={onToggle} aria-pressed={info.mode !== 'off'}>
          <CarFront className="h-3.5 w-3.5" />
          {t(`relief.page.niva.${driving ? 'park' : info.mode === 'placing' ? 'cancel' : 'take'}`)}
        </Button>
        {driving && (
          <Button variant="secondary" size="sm" className="flex-1 whitespace-nowrap text-xs" onClick={onMove}>
            {t('relief.page.niva.move')}
          </Button>
        )}
      </div>
      {info.mode === 'placing' && <p className="text-xs font-medium text-prune-700">{t('relief.page.niva.placing')}</p>}
      {driving && (
        <>
          <div className="space-y-1.5">
            <Toggle checked={settings.lights.low} onChange={(on) => onLight('low', on)} label={t('relief.page.niva.headlights')} />
            <Toggle checked={settings.lights.bar} onChange={(on) => onLight('bar', on)} label={t('relief.page.niva.light_bar')} />
          </div>
          <div>
            <SectionTitle>{t('relief.page.niva.camera')}</SectionTitle>
            <ChoiceGroup
              value={settings.camera}
              onChange={onCamera}
              choices={(['chase', 'orbit'] as const).map((value) => ({ value, label: t(`relief.page.niva.cameras.${value}`) }))}
            />
          </div>
          <p className="hidden text-[0.7rem] leading-snug text-loam-400 sm:block">{t('relief.page.niva.keys')}</p>
        </>
      )}
      <Toggle checked={settings.night} onChange={onNight} label={t('relief.page.niva.night')} hint={t('relief.page.niva.night_hint')} />
    </div>
  )
}

/** Speed, slope and what stops the car, over the scene. */
export function NivaDashboard({ info }: { info: Extract<NivaInfo, { mode: 'driving' }> }) {
  const message = info.status ?? info.warning
  return (
    <div className="pointer-events-none absolute left-1/2 top-11 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl bg-loam-900/80 px-4 py-2 text-center text-white shadow-lg backdrop-blur sm:top-auto sm:bottom-3">
      <p className="text-lg font-semibold tabular-nums leading-tight">
        {formatNumber(info.speedKmh)} <span className="text-xs font-normal opacity-80">km/h</span>
      </p>
      <p className="text-[0.7rem] tabular-nums opacity-80">
        {t('relief.page.niva.dashboard', {
          pitch: `${info.pitchPct > 0 ? '+' : ''}${info.pitchPct}`, roll: info.rollPct, altitude: formatNumber(info.altitude),
        })}
      </p>
      {message && (
        <p className={clsx('text-xs font-medium', info.status ? 'text-clay-100' : 'text-humus-300')}>
          {t(`relief.page.niva.status.${message}`)}
        </p>
      )}
    </div>
  )
}

/** On a touch screen: hold an arrow like a key. */
export function NivaPad({ onKey, raised }: { onKey: (key: NivaKey, down: boolean) => void; raised: boolean }) {
  const pad = (key: NivaKey, icon: ReactNode, className: string) => (
    <button
      type="button"
      aria-label={t(`relief.page.niva.pad.${key}`)}
      className={clsx('flex h-12 w-12 select-none items-center justify-center rounded-full bg-white/85 text-loam-800 shadow-md active:bg-prune-100', className)}
      onPointerDown={(event) => { event.preventDefault(); onKey(key, true) }}
      onPointerUp={() => onKey(key, false)}
      onPointerLeave={() => onKey(key, false)}
      onPointerCancel={() => onKey(key, false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {icon}
    </button>
  )
  return (
    // On a phone the settings sheet covers the bottom: the pad sits above it.
    <div className={clsx(
      'absolute inset-x-3 z-10 flex items-end justify-between sm:bottom-6 sm:left-auto sm:right-6 sm:gap-6',
      raised ? 'bottom-[calc(60dvh+0.75rem)]' : 'bottom-20',
    )}>
      <div className="flex gap-2">
        {pad('left', <ArrowLeft className="h-5 w-5" />, '')}
        {pad('right', <ArrowRight className="h-5 w-5" />, '')}
      </div>
      <div className="flex flex-col items-center gap-2">
        {pad('up', <ArrowUp className="h-5 w-5" />, '')}
        <div className="flex gap-2">
          {pad('brake', <Hand className="h-5 w-5" />, '')}
          {pad('down', <ArrowDown className="h-5 w-5" />, '')}
        </div>
      </div>
    </div>
  )
}
