import { Head, Link, router, useForm, usePage } from '@inertiajs/react'
import { ArrowRight, Droplets, Loader2, Mail, MapPin, Sprout } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ApiError, api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { formatDate } from '@/collab/time'
import { formatArea, t } from '@/lib/i18n'
import { useMapInstance } from '@/map/MapContext'
import { MapView } from '@/map/MapView'
import { installBoundary } from '@/map/layers/boundary'
import { drawSketch } from '@/my_maps/sketch'
import { syncRegionLayers } from '@/map/layers/region'
import { readingLines, type ReadingLine } from '@/trials/reading'
import type { LngLat, RegionLayerData, SharedProps } from '@/types'
import type { SketchGeometry } from '@/types/myMaps'
import type { TrialData, TrialReading, TrialShowProps } from '@/types/trials'

type ReadingState = { status: 'loading' } | { status: 'done'; reading: TrialReading } | { status: 'error' }

/**
 * « Et chez toi ? »: the visitor's own place, tried without an account. The
 * map shows their parcel on the aerial photo (a tap adds or drops one), the
 * first page of their notebook paints it in watercolour, says what the
 * relief tells and what the region knows, and « Garder ce carnet » makes it
 * their first map: an e-mail typed here is enough.
 */
export default function TrialShow(props: TrialShowProps) {
  const [trial, setTrial] = useState<TrialData>(props.trial)
  const [reading, setReading] = useState<ReadingState>({ status: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const base = `/essai/${trial.token}`

  const read = useCallback(async () => {
    setReading({ status: 'loading' })
    try {
      const data = await api<{ reading: TrialReading }>(`${base}/reading`)
      setReading({ status: 'done', reading: data.reading })
    } catch {
      setReading({ status: 'error' })
    }
  }, [base])

  useEffect(() => {
    void read()
  }, [read])

  async function touch(at: LngLat) {
    if (!trial.cadastre || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const data = await api<{ trial: TrialData }>(`${base}/parcel`, { method: 'POST', body: { lng: at[0], lat: at[1] } })
      setTrial(data.trial)
      void read()
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : t('trials.show.no_parcel'))
    } finally {
      setBusy(false)
    }
  }

  const signedIn = usePage<SharedProps>().props.currentUser != null

  function keep() {
    track('trial_keep_click')
    router.post(`${base}/keep`)
  }

  const sentences = reading.status === 'done' ? readingLines(reading.reading, trial.areaM2).map(sentence) : []
  const lowPoint = reading.status === 'done' ? reading.reading.low_point ?? null : null

  return (
    <div className="flex h-dvh flex-col bg-loam-100 md:flex-row">
      <Head title={t('trials.show.title')}>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="relative h-[45dvh] shrink-0 md:h-auto md:min-w-0 md:flex-1">
        <MapView className="absolute inset-0" center={trial.center} zoom={trial.bbox ? undefined : 18} bbox={trial.bbox ?? undefined}>
          <TrialLayers layers={props.layers} cadastre={props.cadastreLayer} trial={trial} lowPoint={lowPoint} onTouch={touch} />
        </MapView>
        <Link href="/" className="absolute left-2 top-2 z-10 rounded-full bg-white/95 p-1.5 shadow ring-1 ring-loam-200" aria-label="Semisto Terranova">
          <Logo className="h-7 w-7" />
        </Link>
        {(busy || notice) && (
          <p className="absolute inset-x-2 bottom-8 z-10 mx-auto w-fit max-w-full rounded-full bg-loam-900/90 px-4 py-1.5 text-sm text-white shadow" role="status">
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> : notice}
          </p>
        )}
      </div>

      <aside className="min-h-0 flex-1 overflow-y-auto bg-loam-50 md:w-[26rem] md:flex-none md:border-l md:border-loam-200">
        <div className="space-y-6 p-5 md:p-6">
          <header>
            <p className="font-hand text-xl text-leaf-700">{t('trials.show.kicker')}</p>
            <h1 className="font-serif text-3xl text-loam-900">{trial.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-loam-500">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{trial.address ?? t('trials.show.address_unknown')}</span>
            </p>
            <PlaceSketch trial={trial} />
            {trial.areaM2 != null && (
              <p className="mt-1 text-sm text-loam-600">
                {formatArea(trial.areaM2)} · {t('trials.show.parcels', { count: trial.parcels.length })}
              </p>
            )}
            <p className="mt-2 text-sm text-loam-500">
              {!trial.cadastre ? t('trials.show.no_cadastre') : trial.parcels.length ? t('trials.show.parcels_hint') : t('trials.show.no_parcel')}
            </p>
          </header>

          <section aria-labelledby="trial-reading" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-200">
            <h2 id="trial-reading" className="flex items-center font-sans gap-2 text-sm font-medium text-leaf-700">
              <Droplets className="h-4 w-4" aria-hidden="true" />
              {t('trials.reading.title')}
            </h2>
            {reading.status === 'loading' && (
              <p className="mt-2 inline-flex items-center gap-2 font-hand text-2xl text-loam-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('trials.reading.loading')}
              </p>
            )}
            {reading.status !== 'loading' && (
              <div className="mt-2 space-y-2 text-loam-800" aria-live="polite">
                {sentences.map((sentence, i) => (
                  <p key={sentence} className={i === 0 ? 'font-hand text-2xl leading-snug text-loam-900' : 'text-[0.95rem]'}>{sentence}</p>
                ))}
                {!trial.relief && <p className="text-sm text-loam-500">{t('trials.reading.no_relief')}</p>}
                {trial.relief && (reading.status === 'error' || (reading.status === 'done' && reading.reading.slope_pct == null)) && (
                  <p className="text-sm text-loam-500">{t('trials.reading.unavailable')}</p>
                )}
              </div>
            )}
          </section>

          {props.knows.length > 0 && (
            <section aria-labelledby="trial-knows">
              <h2 id="trial-knows" className="font-sans text-sm font-medium text-loam-600">{t('trials.knows.title')}</h2>
              <p className="mt-1 text-sm text-loam-500">
                {props.regionName ? t('trials.knows.region', { region: props.regionName }) : t('trials.knows.europe')}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {props.knows.map((name) => (
                  <li key={name} className="rounded-full bg-loam-100 px-3 py-1 text-sm text-loam-700">{name}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl bg-prune-50 p-4 ring-1 ring-prune-100">
            <p className="text-sm font-medium text-prune-800">{t('trials.show.next.title')}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-loam-700">
              {(['water', 'plants', 'time'] as const).map((key) => (
                <li key={key} className="flex gap-2"><Sprout className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />{t(`trials.show.next.${key}`)}</li>
              ))}
            </ul>
            {signedIn ? (
              <Button className="mt-4 w-full justify-center" onClick={keep}>
                {t('trials.show.keep')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : props.sentTo ? (
              <CodeForm email={props.sentTo} base={base} />
            ) : (
              <KeepForm base={base} onOther={keep} />
            )}
          </section>

          {props.from && (
            <p className="font-hand text-xl leading-snug text-leaf-700">
              {t('trials.show.time')}{' '}
              <Link href={props.from.path} className="underline decoration-leaf-400 underline-offset-4 hover:text-leaf-800">
                {t('trials.show.see_garden', { title: props.from.title })}
              </Link>
            </p>
          )}

          <footer className="space-y-1 border-t border-dashed border-loam-300 pt-4 text-sm text-loam-500">
            <p>{t('trials.show.expires', { date: formatDate(trial.expiresAt) })}</p>
            <Link href={props.from ? `/essai?from=${encodeURIComponent(props.from.token)}` : '/essai'} className="text-prune-700 hover:underline">
              {t('trials.show.again')}
            </Link>
          </footer>
        </div>
      </aside>
    </div>
  )
}

/**
 * « Garder ce carnet » without an account: one e-mail, and the account, the
 * sign-in link and the map come in one gesture. Google, Apple or a password
 * go through the usual sign-in page, which comes back here.
 */
function KeepForm({ base, onOther }: { base: string; onOther: () => void }) {
  const form = useForm({ email_address: '' })
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        track('trial_keep_click', { with: 'email' })
        form.post(`${base}/keep`)
      }}
    >
      <Field label={t('trials.show.email')}>
        <Input type="email" required autoComplete="email" value={form.data.email_address} onChange={(e) => form.setData('email_address', e.target.value)} placeholder={t('trials.show.email_placeholder')} />
      </Field>
      <Button type="submit" className="w-full justify-center" disabled={form.processing}>
        {t('trials.show.keep')}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <p className="text-sm text-loam-600">{t('trials.show.keep_hint')}</p>
      <button type="button" onClick={onOther} className="text-sm font-medium text-prune-700 underline-offset-2 hover:underline">
        {t('trials.show.keep_other')}
      </button>
    </form>
  )
}

/** The link is on its way: it opens the map on any device; the code keeps it here. */
function CodeForm({ email, base }: { email: string; base: string }) {
  const form = useForm({ email_address: email, code: '' })
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        form.post('/session/code', { onFinish: () => form.reset('code') })
      }}
    >
      <p className="flex gap-2 rounded-lg bg-leaf-50 p-3 text-sm text-leaf-800" role="status">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t('trials.show.sent', { email })}
      </p>
      <Field label={t('sessions.new.code')}>
        <Input
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          value={form.data.code}
          onChange={(e) => form.setData('code', e.target.value)}
          placeholder="123456"
          className="text-center font-mono text-2xl tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" className="w-full justify-center" disabled={form.processing}>
        {t('sessions.new.code_submit')}
      </Button>
      <Link href={base} className="block text-sm font-medium text-prune-700 underline-offset-2 hover:underline">
        {t('trials.show.other_email')}
      </Link>
    </form>
  )
}

/**
 * The place washed in watercolour, as on the first page of a notebook: its
 * real outline in pencil, its area and a true scale bar (my_maps/sketch).
 */
function PlaceSketch({ trial }: { trial: TrialData }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const seed = [...trial.token].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 100_003, 7)
    const paint = () => drawSketch(el, { id: seed, boundary: trial.boundary as SketchGeometry | null, areaLabel: trial.areaM2 != null ? formatArea(trial.areaM2) : '' }, 0.3, {
      noOutline: t('trials.show.sketch_no_outline'),
      noOutlineHint: t('trials.show.sketch_no_outline_hint'),
      growthLabel: null,
    })
    paint()
    document.fonts?.ready.then(paint)
    const observer = new ResizeObserver(paint)
    observer.observe(el)
    return () => observer.disconnect()
  }, [trial.token, trial.boundary, trial.areaM2])
  return <canvas ref={canvas} aria-hidden="true" className="mt-3 aspect-[4/3] w-full rounded-xl bg-[#fbf8f1] ring-1 ring-loam-200" />
}

const decimal = (value: number) => (Math.round(value * 10) / 10).toLocaleString('fr-BE')

function sentence(line: ReadingLine): string {
  switch (line.key) {
    case 'slope':
      return t('trials.reading.slope', { direction: t(`trials.reading.directions.${line.downhill}`), slope: decimal(line.slope), drop: decimal(line.drop) })
    case 'gentle':
      return t('trials.reading.gentle', { direction: t(`trials.reading.directions.${line.downhill}`), slope: decimal(line.slope) })
    case 'water_side':
      return t('trials.reading.water_side', { side: t(`trials.reading.sides.${line.side}`) })
    case 'sun':
      return t(`trials.reading.sun.${line.facing}`)
    case 'area':
      return t('trials.reading.area', { area: formatArea(line.area), count: line.count })
    case 'small':
      return t('trials.reading.small', { area: formatArea(line.area) })
    default:
      return t(`trials.reading.${line.key}`)
  }
}

/** The aerial photo with the cadastre over it, the parcels kept, and the lowest point. */
function TrialLayers({ layers, cadastre, trial, lowPoint, onTouch }: {
  layers: RegionLayerData[]
  cadastre: string | null
  trial: TrialData
  lowPoint: LngLat | null
  onTouch: (at: LngLat) => void
}) {
  const instance = useMapInstance()
  const marker = useRef<maplibregl.Marker | null>(null)
  const touch = useRef(onTouch)
  touch.current = onTouch

  useEffect(() => {
    if (!instance) return
    const plan = layers.find((l) => l.kind === 'style') ?? layers[0]
    const photo = layers.find((l) => l.category === 'base' && l.options.default === true) ?? layers.find((l) => l.category === 'base' && l.kind !== 'style') ?? plan
    syncRegionLayers(instance, layers, { base: photo?.key ?? null, overlays: cadastre ? [cadastre] : [], opacity: {}, bounds: trial.region?.bounds ?? null }, () => undefined)
  }, [instance, layers, cadastre, trial.region])

  // The place, framed once the map has its final size.
  const framed = useRef(false)
  useEffect(() => {
    if (!instance || framed.current) return
    framed.current = true
    instance.resize()
    if (trial.bbox) instance.fitBounds(trial.bbox, { padding: 60, duration: 0, maxZoom: 19 })
  }, [instance, trial.bbox])

  useEffect(() => {
    if (!instance) return
    const apply = () => installBoundary(instance, trial.boundary)
    if (instance.isStyleLoaded()) apply()
    else instance.once('load', apply)
  }, [instance, trial.boundary])

  useEffect(() => {
    if (!instance) return
    if (!lowPoint) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) {
      const element = document.createElement('div')
      element.className = 'flex items-center gap-1 rounded-full bg-white/95 py-0.5 pl-1 pr-2.5 text-sm font-medium text-loam-800 shadow ring-1 ring-loam-200'
      // Pond water's blue, as in the time-lapse (no token for it).
      element.innerHTML = '<span class="h-3 w-3 rounded-full ring-2 ring-white" style="background:#5f8fb0"></span>'
      element.append(document.createTextNode(t('trials.show.low_point')))
      marker.current = new maplibregl.Marker({ element, anchor: 'left', offset: [-6, 0] }).setLngLat(lowPoint).addTo(instance)
    } else marker.current.setLngLat(lowPoint)
  }, [instance, lowPoint])

  useEffect(() => () => {
    marker.current?.remove()
  }, [])

  useEffect(() => {
    if (!instance) return
    const onClick = (e: MapMouseEvent) => touch.current([e.lngLat.lng, e.lngLat.lat])
    instance.on('click', onClick)
    instance.getCanvas().style.cursor = 'pointer'
    return () => {
      instance.off('click', onClick)
    }
  }, [instance])

  return null
}
