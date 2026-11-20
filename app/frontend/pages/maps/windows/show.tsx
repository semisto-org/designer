import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Camera, Crosshair, Download, Image as ImageIcon, Loader2, Mountain, RotateCcw, Save, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { toast } from '@/components/ui/toast'
import { t } from '@/lib/i18n'
import { photoUrl } from '@/map/photos/format'
import { readPhotoMeta } from '@/map/photos/exif'
import { SEASONS, SEASON_MONTH, calendarYear, seasonOfMonth, sizeAt, yearsBetween, type GrowingPlantsData, type Season } from '@/relief/growth'
import { toGrid } from '@/relief/grid'
import { sunPosition } from '@/relief/sun'
import { loadWindow, outsideBy, type WindowData } from '@/relief/window/load'
import {
  PHONE_FOCAL_35MM, bearingTo, containRect, corrected, coverFov, headingPitch, poseFrom, verticalFov, type Pose,
} from '@/relief/window/pose'
import { askMotion, openCamera, watchHeading, watchPosition, type Heading, type Position } from '@/relief/window/sensors'
import { EYE_HEIGHT, type WindowScene } from '@/relief/window/windowScene'
import type { MapData } from '@/types'
import type { TerrainGridData } from '@/types/relief'

/** A located photo of the map, to look through. */
type WindowPhoto = {
  id: number
  caption: string | null
  takenAt: string | null
  lng: number
  lat: number
  heading: number | null
  width: number | null
  height: number | null
  focal35: number | null
}

type Props = {
  map: MapData
  terrain: TerrainGridData | null
  growingPlants: GrowingPlantsData | null
  photos: WindowPhoto[]
  start: { photoId: number | null; point: [number, number] | null; heading: number | null; year: number | null }
  timezone: string
  canEdit: boolean
}

/** The picture under the plants: the live camera, or a photo (its file, where it was taken, which way). */
type Source =
  | { kind: 'live' }
  | { kind: 'photo'; url: string; lng: number; lat: number; heading: number | null; focal35: number | null; takenAt: string | null; photoId: number | null; caption: string | null }

const YEARS = [5, 15, 30] as const
/** How many plants are named in the view, the nearest first. */
const LABELS = 4

/** « Fenêtre sur l'an 15 »: on the land, the design's plants painted into the camera's view at year 5, 15 or 30. */
export default function WindowShow(props: Props) {
  return (
    <>
      <Head title={`${t('window.page.title')} · ${props.map.name}`} />
      {props.terrain ? <WindowViewer {...props} terrain={props.terrain} /> : <WindowEmpty map={props.map} />}
    </>
  )
}

function WindowEmpty({ map }: { map: MapData }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-loam-50 px-4">
      <div className="max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-900/5">
        <h1 className="font-serif text-2xl text-loam-900">{t('window.page.title')}</h1>
        <p className="mt-2 text-loam-700">{t('window.page.no_terrain')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/maps/${map.id}/relief`} className="rounded-full bg-prune-600 px-4 py-2 text-sm font-medium text-white hover:bg-prune-800">
            {t('window.page.open_relief')}
          </Link>
          <Link href={`/maps/${map.id}`} className="rounded-full px-4 py-2 text-sm font-medium text-prune-700 hover:bg-prune-50">
            {t('window.page.back')}
          </Link>
        </div>
      </div>
    </div>
  )
}

function WindowViewer({ map, terrain, growingPlants, photos, start, canEdit }: Props & { terrain: TerrainGridData }) {
  const stage = useRef<HTMLDivElement>(null)
  const sceneBox = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const scene = useRef<WindowScene | null>(null)
  const [data, setData] = useState<WindowData | null>(null)
  const [failed, setFailed] = useState(false)
  const [source, setSource] = useState<Source | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [heading, setHeading] = useState<Heading | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const [denied, setDenied] = useState<{ camera?: boolean; motion?: boolean; position?: boolean }>({})
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [fix, setFix] = useState({ heading: 0, pitch: 0, zoom: 1 })
  const [guide, setGuide] = useState(false)
  const origin = growingPlants?.origin ?? new Date().toISOString().slice(0, 10)
  const today = growingPlants ? Math.max(0, yearsBetween(growingPlants.origin, growingPlants.today)) : 0
  const [year, setYear] = useState<number>(start.year ?? 15)
  const [season, setSeason] = useState<Season>(() => seasonOfMonth(new Date().getMonth() + 1))
  const [labels, setLabels] = useState<{ key: number; left: number; top: number; name: string; height: number }[]>([])
  const [keeping, setKeeping] = useState(false)
  /** Counts the scenes made, so the year, season and view reach a new one. */
  const [ready, setReady] = useState(0)

  // ---- The relief and the plants -------------------------------------------------
  useEffect(() => {
    let cancelled = false
    loadWindow(terrain, growingPlants)
      .then((loaded) => { if (!cancelled) setData(loaded) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [terrain, growingPlants])

  useEffect(() => {
    if (!data || !sceneBox.current || !source) return
    let disposed = false
    let created: WindowScene | null = null
    import('@/relief/window/windowScene').then(({ WindowScene }) => {
      if (disposed || !sceneBox.current) return
      created = new WindowScene(sceneBox.current, data.occluder, data.frame)
      created.setPlants(data.plants, data.altitudes, year, SEASON_MONTH[season])
      scene.current = created
      setReady((n) => n + 1)
    })
    return () => {
      disposed = true
      created?.dispose()
      scene.current = null
    }
    // The scene is made once per source; the year and season follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, source?.kind])

  useEffect(() => { scene.current?.setYear(year) }, [year, ready])
  useEffect(() => { scene.current?.setMonth(SEASON_MONTH[season]) }, [season, ready])
  useEffect(() => { scene.current?.setGuide(guide) }, [guide, ready])

  // ---- Opening a photo given in the address -----------------------------------------
  useEffect(() => {
    if (start.photoId == null) return
    const photo = photos.find((p) => p.id === start.photoId)
    if (photo) openPhoto(photo)
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- The live camera, the position and the compass ----------------------------------
  useEffect(() => {
    if (source?.kind !== 'live') return
    const stopHeading = watchHeading(setHeading)
    const stopPosition = watchPosition(setPosition, () => setDenied((d) => ({ ...d, position: true })))
    return () => {
      stopHeading()
      stopPosition()
    }
  }, [source?.kind])

  useEffect(() => {
    if (video.current && stream) {
      video.current.srcObject = stream
      video.current.play().catch(() => {})
    }
    return () => { if (stream && source?.kind !== 'live') stream.getTracks().forEach((track) => track.stop()) }
  }, [stream, source?.kind])

  useEffect(() => () => { stream?.getTracks().forEach((track) => track.stop()) }, [stream])

  async function openLive() {
    // iOS asks for the motion sensors only inside the tap, before anything else.
    const motion = await askMotion()
    const camera = await openCamera()
    setDenied({ motion: !motion, camera: !camera })
    setStream(camera)
    setFix({ heading: 0, pitch: 0, zoom: 1 })
    setGuide(false)
    setSource({ kind: 'live' })
  }

  function openPhoto(photo: WindowPhoto) {
    setFix({ heading: 0, pitch: 0, zoom: 1 })
    setPhotoSize(photo.width && photo.height ? { width: photo.width, height: photo.height } : null)
    setGuide(photo.heading == null)
    setSource({
      kind: 'photo', url: photoUrl(map.id, photo.id, 'large'), lng: photo.lng, lat: photo.lat, heading: photo.heading,
      focal35: photo.focal35, takenAt: photo.takenAt, photoId: photo.id, caption: photo.caption,
    })
  }

  async function importPhoto(file: File) {
    const meta = await readPhotoMeta(file)
    if (meta.lng == null || meta.lat == null) {
      toast(t('window.photo.no_position'), { tone: 'error' })
      return
    }
    let focal35: number | null = null
    try {
      const { parse } = await import('exifr/dist/lite.esm.mjs')
      const tags = await parse(file, { pick: ['FocalLengthIn35mmFormat', 'FocalLengthIn35mmFilm'] })
      focal35 = Number(tags?.FocalLengthIn35mmFormat ?? tags?.FocalLengthIn35mmFilm) || null
    } catch {
      // The phone default is used.
    }
    setFix({ heading: 0, pitch: 0, zoom: 1 })
    setPhotoSize(null)
    setGuide(meta.heading == null)
    setSource({ kind: 'photo', url: URL.createObjectURL(file), lng: meta.lng, lat: meta.lat, heading: meta.heading, focal35, takenAt: meta.takenAt, photoId: null, caption: null })
  }

  function close() {
    stream?.getTracks().forEach((track) => track.stop())
    setStream(null)
    setSource(null)
    setHeading(null)
    setPosition(null)
    setLabels([])
  }

  // ---- The stage: the picture's rectangle on screen ------------------------------------
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new ResizeObserver(() => setBox({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [source?.kind])

  const rect = useMemo(() => {
    if (source?.kind === 'photo') {
      return photoSize && box.width ? containRect(photoSize.width, photoSize.height, box.width, box.height) : null
    }
    return { left: 0, top: 0, width: box.width, height: box.height }
  }, [source, photoSize, box])

  // ---- Where the eye stands and looks --------------------------------------------------
  const standing = useMemo(() => {
    if (!data || !source) return null
    const lngLat: [number, number] | null = source.kind === 'photo' ? [source.lng, source.lat] : position ? [position.lng, position.lat] : start.point
    if (!lngLat) return null
    const { x, y } = toGrid(data.meta, lngLat)
    return { lngLat, x, z: y, away: outsideBy(x, y, data.size), altitude: data.ground(x, y) + EYE_HEIGHT }
  }, [data, source, position, start.point])

  /** Without a heading, look towards the middle of the design. */
  const towardsPlants = useMemo(() => {
    if (!data?.plants.length || !standing) return start.heading ?? 0
    const cx = data.plants.reduce((sum, p) => sum + p.x, 0) / data.plants.length
    const cz = data.plants.reduce((sum, p) => sum + p.y, 0) / data.plants.length
    return Math.hypot(cx - standing.x, cz - standing.z) > 3 ? bearingTo(standing, { x: cx, z: cz }) : 0
  }, [data, standing, start.heading])

  const fov = useMemo(() => {
    if (!rect || !source) return 60
    if (source.kind === 'photo') return verticalFov(source.focal35, photoSize?.width ?? 3, photoSize?.height ?? 4) / fix.zoom
    const settings = stream?.getVideoTracks()[0]?.getSettings()
    const vw = video.current?.videoWidth || settings?.width || 1920
    const vh = video.current?.videoHeight || settings?.height || 1080
    return coverFov(verticalFov(PHONE_FOCAL_35MM, vw, vh), vw, vh, rect.width, rect.height) / fix.zoom
  }, [rect, source, photoSize, stream, fix.zoom])

  const basePose: Pose | null = useMemo(() => {
    if (!source) return null
    if (source.kind === 'photo') return poseFrom(source.heading ?? towardsPlants, 0)
    if (heading) return heading.pose
    return denied.motion ? poseFrom(start.heading ?? towardsPlants, 0) : null
  }, [source, heading, towardsPlants, denied.motion, start.heading])

  const pose = useMemo(() => (basePose ? corrected(basePose, fix.heading, fix.pitch) : null), [basePose, fix.heading, fix.pitch])

  const lastLabels = useRef(0)
  const updateLabels = useCallback(() => {
    const s = scene.current
    if (!s || !data || !standing) return
    const shown: typeof labels = []
    const candidates = data.plants
      .map((plant, index) => ({ plant, index, size: sizeAt(plant, year - plant.start) }))
      .filter(({ plant, size }) => plant.plant != null && size && size.height >= 1.5 && (plant.form === 'tree' || plant.form === 'bush'))
      .map((c) => ({ ...c, distance: Math.hypot(c.plant.x - standing.x, c.plant.y - standing.z) }))
      .filter((c) => c.distance > 2 && c.distance < 250)
      .sort((a, b) => a.distance - b.distance)
    for (const { plant, index, size } of candidates) {
      if (shown.length >= LABELS) break
      const info = growingPlants?.plants[plant.plant!]
      const name = info?.ownName || info?.name
      if (!name || !size) continue
      const at = s.project(plant.x, plant.y, data.altitudes[index] + size.height)
      // A label wider than the margin would be cut by the edge.
      if (!at || at.left < 70 || at.top < 40 || at.left > s.width - 70 || at.top > s.height - 8) continue
      if (shown.some((l) => Math.abs(l.left - at.left) < 110 && Math.abs(l.top - at.top) < 34)) continue
      shown.push({ key: index, left: at.left, top: at.top, name, height: size.height })
    }
    setLabels(shown)
  }, [data, standing, year, growingPlants])

  useEffect(() => {
    const s = scene.current
    if (!s || !standing || !pose || !rect) return
    s.setView(standing.x, standing.z, standing.altitude, pose, fov)
    const now = performance.now()
    if (now - lastLabels.current > 150) {
      lastLabels.current = now
      updateLabels()
    } else {
      const timer = setTimeout(updateLabels, 160)
      return () => clearTimeout(timer)
    }
  }, [standing, pose, fov, rect, ready, updateLabels])

  // The light of the hour the picture shows: now, or when the photo was taken.
  useEffect(() => {
    if (!scene.current || !standing) return
    const when = source?.kind === 'photo' && source.takenAt ? new Date(source.takenAt) : new Date()
    scene.current.setSun(sunPosition(when, standing.lngLat[1], standing.lngLat[0]))
  }, [standing, source, ready])

  // ---- Laying the view on the landscape by hand ----------------------------------------
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  function onPointerDown(event: ReactPointerEvent) {
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }
  function onPointerMove(event: ReactPointerEvent) {
    const d = drag.current
    if (!d || d.id !== event.pointerId || !rect) return
    const dx = event.clientX - d.x
    const dy = event.clientY - d.y
    d.x = event.clientX
    d.y = event.clientY
    const fovH = fov * (rect.width / rect.height)
    // The world follows the finger.
    setFix((f) => ({ ...f, heading: f.heading - (dx / rect.width) * fovH, pitch: Math.max(-45, Math.min(45, f.pitch + (dy / rect.height) * fov)) }))
  }
  function onPointerUp(event: ReactPointerEvent) {
    if (drag.current?.id === event.pointerId) drag.current = null
  }

  // ---- « Garder cette vue » ------------------------------------------------------------
  async function capture(): Promise<Blob | null> {
    const s = scene.current
    if (!s || !rect) return null
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const context = canvas.getContext('2d')
    if (!context) return null
    if (source?.kind === 'photo') {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = source.url
      await image.decode()
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    } else if (video.current && video.current.videoWidth) {
      const v = video.current
      const fit = Math.max(rect.width / v.videoWidth, rect.height / v.videoHeight)
      const sw = rect.width / fit
      const sh = rect.height / fit
      context.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height)
    }
    context.drawImage(s.snapshot(), 0, 0, canvas.width, canvas.height)
    // The notebook's hand, bottom left: the year and the place.
    const note = t('window.keep.note', { year, calendar: calendarYear(origin, year) })
    context.font = `${Math.round(26 * ratio)}px "Caveat Variable", cursive`
    context.fillStyle = 'rgba(255, 252, 245, 0.92)'
    context.shadowColor = 'rgba(0, 0, 0, 0.45)'
    context.shadowBlur = 6 * ratio
    context.fillText(note, 16 * ratio, canvas.height - 18 * ratio)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  }

  async function keepView() {
    if (keeping || !standing || !pose) return
    setKeeping(true)
    try {
      const blob = await capture()
      if (!blob) throw new Error('capture')
      const name = `fenetre-an-${year}.jpg`
      if (!canEdit) {
        download(blob, name)
        return
      }
      const form = new FormData()
      form.append('photo[image]', new File([blob], name, { type: 'image/jpeg' }))
      form.append('photo[source]', 'web')
      form.append('photo[caption]', t('window.keep.caption', { year, calendar: calendarYear(origin, year) }))
      form.append('photo[heading]', String(Math.round(headingPitch(pose).heading)))
      form.append('photo[lng]', String(standing.lngLat[0]))
      form.append('photo[lat]', String(standing.lngLat[1]))
      form.append('photo[location_source]', source?.kind === 'photo' ? 'exif' : 'device')
      const response = await fetch(`/maps/${map.id}/photos`, {
        method: 'POST', body: form, credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '' },
      })
      if (!response.ok) throw new Error('upload')
      toast(t('window.keep.saved'), { tone: 'success', action: { label: t('window.keep.download'), run: () => download(blob, name) } })
    } catch {
      toast(t('window.keep.failed'), { tone: 'error' })
    } finally {
      setKeeping(false)
    }
  }

  // ---- The page ---------------------------------------------------------------------
  const back = `/maps/${map.id}`
  const calendar = calendarYear(origin, year)
  const status = statusLine({ source, standing, heading, position, denied, guide })
  const yearOptions = [
    ...((YEARS as readonly number[]).includes(today) ? [] : [{ value: String(today), label: t('window.page.today') }]),
    ...YEARS.map((y) => ({ value: String(y), label: t('window.page.year', { year: y }) })),
  ].sort((a, b) => Number(a.value) - Number(b.value))

  if (!source) {
    return (
      <WindowStart
        map={map} photos={photos} loading={!data && !failed} failed={failed} plants={data?.plants.length ?? null}
        onLive={openLive} onPhoto={openPhoto} onImport={importPhoto} back={back} calendar={calendarYear(origin, 15)}
      />
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-loam-950 text-white">
      <div
        ref={stage}
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {source.kind === 'live' && (
          <video ref={video} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
        )}
        {source.kind === 'photo' && (
          <img
            src={source.url}
            alt={source.caption ?? t('window.photo.alt')}
            crossOrigin="anonymous"
            className="absolute inset-0 h-full w-full object-contain"
            onLoad={(event) => setPhotoSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        )}
        <div
          ref={sceneBox}
          className="pointer-events-none absolute"
          style={rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : { inset: 0 }}
        />
        {rect && labels.map((label) => (
          <div
            key={label.key}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full pb-1 text-center"
            style={{ left: rect.left + label.left, top: rect.top + label.top }}
          >
            <span className="inline-block -rotate-2 whitespace-nowrap rounded-lg bg-loam-50/90 px-2 py-0.5 font-hand text-lg leading-tight text-loam-900 shadow-sm sm:text-xl">
              {label.name} · {formatMetres(label.height)}
            </span>
          </div>
        ))}
      </div>

      {/* Top: back, the title and the help. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center gap-2">
          <IconButton label={t('window.page.close')} onClick={close} className="bg-white/90 text-loam-900">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <div>
            <h1 className="font-serif text-xl leading-tight text-white drop-shadow">{t('window.page.year_title', { year })}</h1>
            <p className="text-sm text-white/80">{t('window.page.calendar', { calendar })}</p>
          </div>
        </div>
        <div className="pointer-events-auto">
          <HelpButton slug="fenetre-sur-lan-15" iconOnly className="bg-white/90 text-loam-900" />
        </div>
      </div>

      {guide && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
          <p className="rounded-2xl bg-white/90 px-4 py-2 text-center text-sm text-loam-800 shadow">{t('window.page.guide_hint')}</p>
        </div>
      )}

      {/* Bottom: the year, the season, and what to do. */}
      <div className="absolute inset-x-0 bottom-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl rounded-2xl bg-white/95 p-3 text-loam-900 shadow-lg ring-1 ring-loam-900/5">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={t('window.page.year_label')}
              value={String(year)}
              options={yearOptions}
              onChange={(value) => setYear(Number(value))}
            />
            <Segmented
              label={t('window.page.season_label')}
              value={season}
              options={SEASONS.map((value) => ({ value, label: t(`relief.page.growth.season.${value}`) }))}
              onChange={setSeason}
            />
          </div>
          {status && <p className={clsx('mt-2 text-sm', status.tone === 'warn' ? 'text-humus-800' : 'text-loam-600')}>{status.text}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant={guide ? 'primary' : 'secondary'} size="sm" onClick={() => setGuide((g) => !g)}>
              <Mountain className="h-4 w-4" />
              {guide ? t('window.page.guide_done') : t('window.page.guide')}
            </Button>
            {(fix.heading !== 0 || fix.pitch !== 0 || fix.zoom !== 1) && (
              <Button variant="ghost" size="sm" onClick={() => setFix({ heading: 0, pitch: 0, zoom: 1 })}>
                <RotateCcw className="h-4 w-4" />
                {source.kind === 'photo' ? t('window.page.reset_photo') : t('window.page.reset')}
              </Button>
            )}
            {guide && source.kind === 'photo' && (
              <Button variant="ghost" size="sm" onClick={() => setFix((f) => ({ ...f, zoom: f.zoom >= 1.6 ? 0.7 : Math.round((f.zoom + 0.15) * 100) / 100 }))}>
                <Crosshair className="h-4 w-4" />
                {t('window.page.zoom', { value: Math.round(fix.zoom * 100) })}
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="leaf" size="sm" onClick={keepView} disabled={keeping || !pose || !standing || (standing?.away ?? 0) > 0}>
              {keeping ? <Loader2 className="h-4 w-4 animate-spin" /> : canEdit ? <Save className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {canEdit ? t('window.keep.button') : t('window.keep.download')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const metres = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 0 })
const metresFine = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 })
function formatMetres(value: number): string {
  return `${(value < 10 ? metresFine : metres).format(value)} m`
}

function formatDistance(value: number): string {
  return value >= 1000 ? `${metresFine.format(value / 1000)} km` : `${metres.format(value)} m`
}

/** One line under the year: where the window stands, how sure the compass is, or what is missing. */
function statusLine({ source, standing, heading, position, denied, guide }: {
  source: Source | null
  standing: { away: number } | null
  heading: Heading | null
  position: Position | null
  denied: { camera?: boolean; motion?: boolean; position?: boolean }
  guide: boolean
}): { text: string; tone: 'info' | 'warn' } | null {
  if (!source) return null
  if (source.kind === 'live') {
    if (denied.camera) return { text: t('window.status.no_camera'), tone: 'warn' }
    if (denied.position) return { text: t('window.status.no_position'), tone: 'warn' }
    if (!position) return { text: t('window.status.locating'), tone: 'info' }
    if (standing && standing.away > 30) return { text: t('window.status.away', { distance: formatDistance(standing.away) }), tone: 'warn' }
    if (denied.motion) return { text: t('window.status.no_motion'), tone: 'warn' }
    if (!heading) return { text: t('window.status.turning'), tone: 'info' }
    if (!heading.absolute) return { text: t('window.status.no_north'), tone: 'warn' }
    const accuracy = heading.accuracy != null && heading.accuracy > 0 ? t('window.status.compass_accuracy', { degrees: Math.round(heading.accuracy) }) : ''
    return { text: t('window.status.live', { accuracy: formatDistance(position.accuracy), compass: accuracy }), tone: 'info' }
  }
  if (standing && standing.away > 30) return { text: t('window.status.photo_away', { distance: formatDistance(standing.away) }), tone: 'warn' }
  if (source.heading == null) return { text: t('window.status.photo_no_heading'), tone: 'warn' }
  return guide ? null : { text: t('window.status.photo'), tone: 'info' }
}

/** Before opening: what the window does, and the two ways in (the camera on the land, a photo taken there). */
function WindowStart({ map, photos, loading, failed, plants, onLive, onPhoto, onImport, back, calendar }: {
  map: MapData
  photos: WindowPhoto[]
  loading: boolean
  failed: boolean
  plants: number | null
  onLive: () => void
  onPhoto: (photo: WindowPhoto) => void
  onImport: (file: File) => void
  back: string
  calendar: number
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="min-h-dvh bg-loam-50">
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <Link href={back} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-prune-700 hover:bg-prune-50">
            <ArrowLeft className="h-4 w-4" />
            {map.name}
          </Link>
          <HelpButton slug="fenetre-sur-lan-15" compact />
        </div>
        <h1 className="mt-4 font-serif text-3xl text-loam-900">{t('window.page.title')}</h1>
        <p className="mt-2 text-loam-700">{t('window.start.intro', { calendar })}</p>
        <HandNote arrow="down" tone="leaf" className="mt-3">{t('window.start.outside')}</HandNote>

        {failed && <p className="mt-4 rounded-2xl bg-clay-50 p-3 text-sm text-clay-700">{t('window.start.failed')}</p>}
        {plants === 0 && <p className="mt-4 rounded-2xl bg-humus-50 p-3 text-sm text-humus-800">{t('window.start.no_plants')}</p>}

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/5">
          <h2 className="font-serif text-xl text-loam-900">{t('window.start.live_title')}</h2>
          <p className="mt-1 text-sm text-loam-600">{t('window.start.live_body')}</p>
          <Button className="mt-3" onClick={onLive} disabled={loading || failed}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {t('window.start.live_button')}
          </Button>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/5">
          <h2 className="font-serif text-xl text-loam-900">{t('window.start.photo_title')}</h2>
          <p className="mt-1 text-sm text-loam-600">{t('window.start.photo_body')}</p>
          {photos.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.slice(0, 24).map((photo) => (
                <li key={photo.id}>
                  <Button
                    variant="ghost"
                    className="!block !w-full !p-0"
                    onClick={() => onPhoto(photo)}
                    disabled={loading || failed}
                    aria-label={photo.caption || t('window.photo.pick')}
                  >
                    <span className="relative block aspect-square overflow-hidden rounded-xl bg-loam-100">
                      <img src={photoUrl(map.id, photo.id, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {photo.heading == null && (
                        <span className="absolute inset-x-1 bottom-1 rounded-full bg-white/90 px-1.5 py-0.5 text-center text-sm text-loam-700">{t('window.photo.to_align')}</span>
                      )}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-loam-500">{t('window.start.no_photos')}</p>
          )}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/heic,image/heif,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onImport(file)
            }}
          />
          <Button variant="secondary" className="mt-3" onClick={() => input.current?.click()} disabled={loading || failed}>
            <Upload className="h-4 w-4" />
            {t('window.start.import')}
          </Button>
          <p className="mt-2 flex items-center gap-1 text-sm text-loam-500"><ImageIcon className="h-4 w-4" />{t('window.start.import_hint')}</p>
        </div>
      </div>
    </div>
  )
}
