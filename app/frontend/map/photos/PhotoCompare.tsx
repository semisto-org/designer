import { ArrowLeftRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Select } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { formatDay, photoDate, photoLabel, photoUrl } from '@/map/photos/format'
import { photoActions, usePhotos } from '@/map/photos/store'

/** Before / after of the same spot: the « after » photo is revealed by a slider over the « before » one. */
export function PhotoCompare() {
  const editor = useEditor()
  const { photos, compare } = usePhotos()
  const [position, setPosition] = useState(50)
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)

  const before = compare ? photos.find((p) => p.id === compare.beforeId) : null
  const after = compare ? photos.find((p) => p.id === compare.afterId) : null

  useEffect(() => {
    if (!compare) return
    setPosition(50)
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && photoActions.closeCompare()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compare])

  if (!compare || !before || !after) return null
  const mapId = editor.map.id
  // Frame ratio follows the « before » photo, the two are cropped alike.
  const ratio = before.width && before.height ? `${before.width} / ${before.height}` : '4 / 3'

  function moveTo(clientX: number) {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    setPosition(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)))
  }
  const onDown = (event: ReactPointerEvent) => {
    dragging.current = true
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    moveTo(event.clientX)
  }
  const onMove = (event: ReactPointerEvent) => dragging.current && moveTo(event.clientX)
  const onUp = () => { dragging.current = false }

  const others = photos.filter((p) => p.id !== before.id)

  return createPortal(
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('soil_photos.compare.title')} tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-loam-950 p-3 text-white outline-none md:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-base text-white">{t('soil_photos.compare.title')}</h2>
        <label className="flex items-center gap-2 text-xs">
          <span>{t('soil_photos.compare.after_photo')}</span>
          <Select
            value={after.id}
            onChange={(e) => {
              const other = photos.find((p) => p.id === Number(e.target.value))
              if (!other) return
              const [b, a] = photoDate(other) < photoDate(before) ? [other.id, before.id] : [before.id, other.id]
              photoActions.openCompare(b, a)
            }}
            className="!w-56 !py-1 text-xs !text-loam-900"
          >
            {others.map((p) => <option key={p.id} value={p.id}>{formatDay(photoDate(p))}{p.caption ? ` — ${p.caption}` : ''}</option>)}
          </Select>
        </label>
        <button type="button" onClick={() => photoActions.openCompare(compare.afterId, compare.beforeId)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20">
          <ArrowLeftRight className="h-4 w-4" />
          {t('soil_photos.compare.swap')}
        </button>
        <button type="button" onClick={() => photoActions.closeCompare()} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label={t('common.close')}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          ref={frame}
          className="relative max-h-full max-w-full select-none overflow-hidden rounded-md bg-black shadow-2xl"
          style={{ aspectRatio: ratio, height: '100%', maxWidth: '100%' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
          <img src={photoUrl(mapId, after.id, 'large')} alt={`${t('soil_photos.compare.after')} : ${photoLabel(after)}`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          <img src={photoUrl(mapId, before.id, 'large')} alt={`${t('soil_photos.compare.before')} : ${photoLabel(before)}`} className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} draggable={false} />
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs">{t('soil_photos.compare.before')} · {formatDay(photoDate(before))}</span>
          <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs">{t('soil_photos.compare.after')} · {formatDay(photoDate(after))}</span>
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${position}%` }}>
            <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-loam-700 shadow-lg">
              <ArrowLeftRight className="h-4 w-4" />
            </span>
          </div>
          <input
            type="range" min={0} max={100} step={1} value={Math.round(position)}
            onChange={(e) => setPosition(Number(e.target.value))}
            aria-label={t('soil_photos.compare.slider')}
            className="absolute inset-x-0 bottom-0 h-6 w-full cursor-ew-resize opacity-0 focus-visible:opacity-100"
          />
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-white/70">{t('soil_photos.compare.hint')}</p>
    </div>,
    document.body,
  )
}
