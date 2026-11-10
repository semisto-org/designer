import clsx from 'clsx'
import { CloudRain, Moon, MoonStar, Pause, Play, RotateCcw, SlidersHorizontal, Sun, SunMedium } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'

type Clock = {
  /** The time shown, already formatted (« 03:40 »). */
  time: string
  /** Slider position and range. */
  value: number
  min: number
  max: number
  step: number
  running: boolean
  onChange: (value: number) => void
  onToggle: () => void
}

/**
 * While presenting a step in 3D, the moving part of the view stays at hand:
 * let the night go by (cold air), the day (sun and shade) or the rain, from a
 * small bar at the bottom, so the client sees it happen. « Réglages » opens
 * the full settings for anything else.
 */
export function PresentationTimeControl({ tab, night, day, rain, status, settingsOpen, onSettings, className }: {
  tab: 'view' | 'rain' | 'sun' | 'night'
  night?: Clock
  /** Only when the sun is shown at one hour of a day. */
  day?: Clock
  rain?: { playing: boolean; onPlay: () => void; onReset: () => void }
  /** One line on what is happening (the cold-air layer's depth…). */
  status?: string | null
  settingsOpen: boolean
  onSettings: () => void
  className?: string
}) {
  const clock = tab === 'night' ? night : tab === 'sun' ? day : undefined
  const Icon = tab === 'night' ? Moon : SunMedium

  return (
    <div
      role="group"
      aria-label={t('relief.page.present.label')}
      className={clsx(
        'z-30 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_10px_30px_rgb(26_26_26/0.22)] ring-1 ring-loam-200 backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {clock && (
          <>
            <Icon className="h-4 w-4 shrink-0 text-prune-700" aria-hidden />
            <span className="w-12 shrink-0 font-serif text-lg tabular-nums text-loam-900" aria-live="off">{clock.time}</span>
            <input
              type="range"
              aria-label={t(tab === 'night' ? 'relief.page.night.hour' : 'relief.page.sun.hour')}
              min={clock.min}
              max={clock.max}
              step={clock.step}
              value={clock.value}
              onChange={(event) => clock.onChange(Number(event.target.value))}
              className="min-w-0 flex-1 accent-prune-600"
            />
            <Button size="sm" onClick={clock.onToggle}>
              {clock.running ? <Pause className="h-4 w-4" aria-hidden />
                : tab === 'night' ? <MoonStar className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
              {clock.running
                ? t(tab === 'night' ? 'relief.page.night.stop' : 'relief.page.sun.stop_day')
                : t(tab === 'night' ? 'relief.page.night.play' : 'relief.page.sun.play_day')}
            </Button>
          </>
        )}
        {tab === 'rain' && rain && (
          <>
            <CloudRain className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
            <Button size="sm" className="flex-1" onClick={rain.onPlay}>
              {rain.playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              {rain.playing ? t('relief.page.rain.pause') : t('relief.page.rain.play')}
            </Button>
            <IconButton size="sm" label={t('relief.page.rain.reset')} onClick={rain.onReset}>
              <RotateCcw />
            </IconButton>
          </>
        )}
        {clock || (tab === 'rain' && rain) ? (
          <IconButton size="sm" label={t(settingsOpen ? 'relief.page.present.hide_settings' : 'relief.page.present.settings')} pressed={settingsOpen} onClick={onSettings}>
            <SlidersHorizontal />
          </IconButton>
        ) : (
          <Button variant="ghost" size="sm" aria-pressed={settingsOpen} onClick={onSettings}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t(settingsOpen ? 'relief.page.present.hide_settings' : 'relief.page.present.settings')}
          </Button>
        )}
      </div>
      {status && <p className="mt-1 text-sm text-loam-600" aria-live="polite">{status}</p>}
    </div>
  )
}
