import { Droplets, Thermometer } from 'lucide-react'
import type { IControl } from 'maplibre-gl'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { weatherStationsActions } from '@/map/weather_stations/store'
import type { WeatherNow } from '@/types/weather_stations'

const NBSP = ' '
const REFRESH_MS = 10 * 60 * 1000

/** An empty MapLibre control the badge is portaled into. */
class SlotControl implements IControl {
  readonly element = document.createElement('div')
  onAdd() {
    this.element.className = 'maplibregl-ctrl editor-weather-now'
    return this.element
  }
  onRemove() { this.element.remove() }
}

/** "il y a 20 min", "il y a 2 h" */
function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (minutes < 60) return t('weather_now.ago_minutes', { count: minutes })
  return t('weather_now.ago_hours', { count: Math.round(minutes / 60) })
}

/**
 * The temperature and humidity measured right now at the nearest official
 * station, beside « Sources de la carte » (bottom right). Hovering or
 * focusing it says where the reading comes from; clicking opens the
 * « Climat » panel on that station. Hidden when the region has no station
 * provider or no station near enough publishes a reading.
 */
export default function WeatherNowOverlay() {
  const editor = useEditor()
  const map = editor.instance
  const mapId = editor.map.id
  const centerKey = editor.map.center?.join(',') ?? ''
  const [now, setNow] = useState<WeatherNow | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const tipId = useId()

  useEffect(() => {
    const control = new SlotControl()
    map.addControl(control, 'bottom-right')
    // Right beside the attribution (MapLibre puts bottom controls first).
    const place = () => {
      const attribution = map.getContainer().querySelector('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib')
      if (attribution && control.element.nextSibling !== attribution) attribution.before(control.element)
    }
    place()
    map.once('idle', place)
    setSlot(control.element)
    return () => {
      map.off('idle', place)
      map.removeControl(control)
      setSlot(null)
    }
  }, [map])

  useEffect(() => {
    if (!centerKey) return
    let controller = new AbortController()
    const load = () => {
      controller.abort()
      controller = new AbortController()
      api<WeatherNow>(`/maps/${mapId}/weather_stations/now`, { signal: controller.signal })
        .then((data) => { setNow(data); setClock(Date.now()) })
        .catch(() => { /* No badge rather than an error: the « Climat » panel says why. */ })
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => { window.clearInterval(timer); controller.abort() }
  }, [mapId, centerKey])

  // Keeps "il y a … min" true between two readings.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  if (!slot || !now?.available) return null

  const temp = `${formatNumber(now.tempC)}${NBSP}°C`
  const humidity = `${formatNumber(now.humidityPct)}${NBSP}%`
  const station = now.station
  const distance = `${formatNumber(station.distanceKm)}${NBSP}km`

  return createPortal(
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={tipId}
        aria-label={t('weather_now.label', { temp, humidity, station: station.name })}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => {
          setOpen(false)
          weatherStationsActions.focus(station.code)
          editor.openPanel('climate')
        }}
        className="flex items-center gap-2 rounded-full bg-white/85 px-2.5 py-0.5 text-sm font-medium text-loam-800 shadow-sm ring-1 ring-loam-900/10 backdrop-blur-sm hover:bg-white! focus-visible:outline-2 focus-visible:outline-prune-600"
      >
        <span className="flex items-center gap-0.5"><Thermometer className="h-3.5 w-3.5 text-clay-500" aria-hidden="true" />{temp}</span>
        <span className="flex items-center gap-0.5"><Droplets className="h-3.5 w-3.5 text-lichen-600" aria-hidden="true" />{humidity}</span>
      </button>
      <div
        id={tipId}
        role="tooltip"
        className={
          'pointer-events-none absolute bottom-full right-0 mb-2 w-72 rounded-xl bg-loam-900 p-3 text-sm text-white shadow-lg transition-opacity duration-200 '
          + (open ? 'opacity-100' : 'opacity-0')
        }
      >
        <p className="font-medium">{t('weather_now.tip.title', { station: station.name })}</p>
        <p className="mt-1 text-loam-100">
          {t(station.nearest ? 'weather_now.tip.where_nearest' : 'weather_now.tip.where', { distance })}
          {' '}
          {t(`weather_now.tip.network.${now.network}`)}
        </p>
        <p className="mt-1 text-loam-100">{t('weather_now.tip.when', { ago: ago(now.observedAt, clock) })}</p>
        <p className="mt-2 text-loam-300">{t('weather_now.tip.source', { name: now.attribution.name, licence: now.attribution.licence })}</p>
      </div>
    </div>,
    slot,
  )
}
