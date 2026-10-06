import clsx from 'clsx'
import { Eye, EyeOff, ImagePlus, Move, Pencil, Trash2 } from 'lucide-react'
import { type FormEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import OpacitySlider from '@/map/plan_images/OpacitySlider'
import { PlacingDetails } from '@/map/plan_images/PlacingBar'
import { initialPose, toLocal } from '@/map/plan_images/pose'
import { type PlanImage, planImagesStore, usePlanImages } from '@/map/plan_images/store'

// Same rules as the server (PlanImage::CONTENT_TYPES, MAX_BYTES).
const CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MEGABYTES = 30

/** Width / height of an image file, read in the browser. */
function aspectOf(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      if (image.naturalWidth && image.naturalHeight) resolve(image.naturalWidth / image.naturalHeight)
      else reject(new Error('empty'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable'))
    }
    image.src = url
  })
}

function RenameForm({ image, onDone }: { image: PlanImage; onDone: () => void }) {
  const { notify } = useEditor()
  const [name, setName] = useState(image.name)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    planImagesStore.update(image.id, { name: name.trim() }).then(onDone, (error: Error) => notify(error.message, 'error'))
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('plan_images.rename')} />
      <Button type="submit" size="sm">{t('plan_images.save')}</Button>
      <Button variant="ghost" size="sm" onClick={onDone}>{t('plan_images.cancel')}</Button>
    </form>
  )
}

/**
 * « Fonds de plan »: sketches and plans handed to a client, laid on the map
 * under the drawing. Import one or several images, place each with the
 * mouse, fade it, show or hide it.
 */
export default function PlanImagesPanel() {
  const editor = useEditor()
  const { images, placingId } = usePlanImages()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  // On a phone the panel covers the map: placing happens with the panel closed.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const startPlacing = (id: number) => {
    planImagesStore.place(id)
    if (!isDesktop) editor.openPanel(null)
  }
  // The last one is drawn on top: list it first.
  const listed = [...images].sort((a, b) => b.position - a.position || b.id - a.id)

  async function importFile(file: File) {
    const max = { max: MAX_MEGABYTES }
    if (!CONTENT_TYPES.includes(file.type)) return editor.notify(t('plan_images.not_an_image', { name: file.name }), 'error')
    if (file.size > MAX_MEGABYTES * 1024 * 1024) return editor.notify(t('plan_images.too_large', { name: file.name, ...max }), 'error')
    let aspect: number
    try {
      aspect = await aspectOf(file)
    } catch {
      return editor.notify(t('plan_images.unreadable', { name: file.name }), 'error')
    }
    const map = editor.instance
    const center = map.getCenter()
    const bounds = map.getBounds()
    const origin = { centerLng: center.lng, centerLat: center.lat }
    const viewWidth = Math.abs(toLocal(origin, [bounds.getEast(), center.lat])[0] - toLocal(origin, [bounds.getWest(), center.lat])[0])
    const viewHeight = Math.abs(toLocal(origin, [center.lng, bounds.getNorth()])[1] - toLocal(origin, [center.lng, bounds.getSouth()])[1])
    const pose = initialPose([center.lng, center.lat], viewWidth, viewHeight, aspect)

    const form = new FormData()
    form.append('plan_image[image]', file)
    form.append('plan_image[name]', file.name.replace(/\.[^.]+$/, '').slice(0, 80) || file.name)
    form.append('plan_image[center_lng]', String(pose.centerLng))
    form.append('plan_image[center_lat]', String(pose.centerLat))
    form.append('plan_image[width_m]', String(pose.widthM))
    form.append('plan_image[rotation]', '0')
    form.append('plan_image[aspect]', String(pose.aspect))
    const created = await planImagesStore.create(form)
    startPlacing(created.id)
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) await importFile(file)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  function toggle(image: PlanImage) {
    if (!editor.canEdit) return planImagesStore.preview(image.id, { visible: !image.visible })
    planImagesStore.update(image.id, { visible: !image.visible }).catch((error: Error) => editor.notify(error.message, 'error'))
  }

  function remove(image: PlanImage) {
    if (!window.confirm(t('plan_images.delete_confirm', { name: image.name }))) return
    planImagesStore.remove(image.id).catch((error: Error) => editor.notify(error.message, 'error'))
  }

  return (
    <div className="space-y-4">
      {editor.canEdit && <p className="text-sm text-loam-600">{t('plan_images.intro')}</p>}

      {images.length === 0 && (
        <p className="text-sm text-loam-500">{t(editor.canEdit ? 'plan_images.empty' : 'plan_images.empty_readonly')}</p>
      )}

      {listed.length > 0 && (
        <ul className="divide-y divide-loam-100">
          {listed.map((image) => (
            <li key={image.id} className={clsx('py-3', placingId === image.id && 'rounded-xl bg-prune-50 px-2')}>
              {renamingId === image.id ? (
                <RenameForm image={image} onDone={() => setRenamingId(null)} />
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(image)}
                    aria-pressed={image.visible}
                    title={t(image.visible ? 'plan_images.hide' : 'plan_images.show')}
                    aria-label={t(image.visible ? 'plan_images.hide' : 'plan_images.show')}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-loam-600 hover:bg-loam-100"
                  >
                    {image.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-loam-400" />}
                  </button>
                  <span className={clsx('min-w-0 flex-1 truncate text-sm font-medium', image.visible ? 'text-loam-900' : 'text-loam-400')}>
                    {image.name}
                    {!image.visible && <span className="ml-1.5 text-xs font-normal">({t('plan_images.hidden')})</span>}
                  </span>
                  {editor.canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => setRenamingId(image.id)}
                        title={t('plan_images.rename')}
                        aria-label={t('plan_images.rename')}
                        className="grid h-8 w-8 place-items-center rounded-full text-loam-500 hover:bg-loam-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(image)}
                        title={t('plan_images.delete')}
                        aria-label={t('plan_images.delete')}
                        className="grid h-8 w-8 place-items-center rounded-full text-loam-500 hover:bg-clay-50 hover:text-clay-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="mt-2 flex items-end gap-3 pl-10">
                <OpacitySlider image={image} className="block flex-1" />
                {editor.canEdit && (
                  <Button
                    variant={placingId === image.id ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      if (!image.visible) toggle(image)
                      if (placingId === image.id) planImagesStore.place(null)
                      else startPlacing(image.id)
                    }}
                  >
                    <Move className="h-3.5 w-3.5" />
                    {t('plan_images.place')}
                  </Button>
                )}
              </div>
              {placingId === image.id && (
                <PlacingDetails
                  image={image}
                  onRotate={(rotation) => planImagesStore.update(image.id, { rotation }).catch((error: Error) => editor.notify(error.message, 'error'))}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {editor.canEdit && (
        <div>
          <input
            ref={input}
            type="file"
            accept={CONTENT_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus className="h-4 w-4" />
            {t(busy ? 'plan_images.adding' : 'plan_images.add')}
          </Button>
          <p className="mt-2 text-xs text-loam-500">{t('plan_images.formats', { max: MAX_MEGABYTES })}</p>
        </div>
      )}
    </div>
  )
}
