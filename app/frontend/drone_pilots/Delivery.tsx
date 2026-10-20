import { router } from '@inertiajs/react'
import { FileUp, Image, Layers } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { toast } from '@/components/ui/toast'
import { sendInParts, uploadAerialView } from '@/drone/upload'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { formatBytes } from '@/lib/money'
import { uploadActions, useUploads } from '@/map/photos/upload'
import type { MissionDetail } from '@/types/drone_pilots'

// Matches AerialView::PRODUCTS and UPLOAD_EXTENSIONS.
const PRODUCTS = ['orthophoto', 'elevation', 'thermal', 'multispectral'] as const
const RASTER_ACCEPT = '.tif,.tiff,.mbtiles,.pmtiles'
// Matches DroneMissions::FilesController::EXTENSIONS.
const FILE_ACCEPT = '.las,.laz,.e57,.ply,.xyz,.obj,.mtl,.glb,.gltf,.fbx,.zip,.pdf,.csv,.kml,.kmz,.txt,.tif,.tiff'

type Progress = { name: string; sent: number; total: number } | null

const message = (error: unknown) => (error instanceof ApiError ? error.message : null) ?? t('drone_missions.delivery.failed')

/**
 * « Déposer les données »: what the pilot of a paid mission puts on the
 * client's map. Rasters (orthophoto, elevation, thermal, multispectral
 * GeoTIFF) become drone views of the map, photos and videos go to its
 * photos, everything else (point clouds, 3D models, reports) stays with
 * the mission, to download.
 */
export function Delivery({ mission }: { mission: MissionDetail }) {
  const [progress, setProgress] = useState<Progress>(null)
  const [product, setProduct] = useState<(typeof PRODUCTS)[number]>('orthophoto')
  const [capturedOn, setCapturedOn] = useState(mission.flightOn ?? new Date().toISOString().slice(0, 10))
  const rasterInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const uploads = useUploads()
  const photosSending = uploads.filter((u) => u.status === 'pending' || u.status === 'uploading').length
  const reload = () => router.reload({ only: ['mission'] })

  async function sendRaster(file: File) {
    setProgress({ name: file.name, sent: 0, total: file.size })
    try {
      await uploadAerialView(mission.map.id, file, { name: t(`drone_pilots.data_types.${product}.name`), capturedOn, product },
        { missionId: mission.id, onProgress: (p) => setProgress({ name: file.name, ...p }) })
      toast(t('drone_missions.delivery.raster_sent'), { tone: 'success' })
    } catch (error) {
      toast(message(error), { tone: 'error' })
    } finally {
      setProgress(null)
      reload()
    }
  }

  async function sendFile(file: File) {
    setProgress({ name: file.name, sent: 0, total: file.size })
    try {
      const created = await api<{ uploadId: number; upload: { partsUrl: string; partSize: number; partCount: number } }>(
        `/missions-drone/${mission.id}/files`, { method: 'POST', body: { file: { filename: file.name, byte_size: file.size } } })
      const checksum = await sendInParts(file, created.upload, { onProgress: (p) => setProgress({ name: file.name, ...p }) })
      await api(`/missions-drone/${mission.id}/files/${created.uploadId}/complete`, { method: 'POST', body: { checksum } })
      toast(t('drone_missions.delivery.file_sent'), { tone: 'success' })
    } catch (error) {
      toast(message(error), { tone: 'error' })
    } finally {
      setProgress(null)
      reload()
    }
  }

  const busy = progress !== null
  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10 sm:p-6" aria-labelledby="delivery">
      <div>
        <h2 id="delivery" className="text-xl">{t('drone_missions.delivery.title')}</h2>
        <p className="mt-1 text-pretty text-sm text-loam-600">{t('drone_missions.delivery.lead')}</p>
      </div>

      {progress && (
        <div className="rounded-lg bg-prune-50 px-3 py-2.5 text-sm text-prune-900 ring-1 ring-inset ring-prune-200" role="status">
          <p className="truncate font-medium">{progress.name}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-prune-100" aria-hidden>
            <div className="h-full rounded-full bg-prune-600 transition-[width] duration-500" style={{ width: `${progress.total ? Math.floor((progress.sent / progress.total) * 100) : 0}%` }} />
          </div>
          <p className="mt-1.5">{t('drone_missions.delivery.sending', { sent: formatBytes(progress.sent), total: formatBytes(progress.total) })}</p>
        </div>
      )}

      <div className="space-y-3 rounded-xl bg-loam-50 p-4">
        <p className="flex items-center gap-1.5 font-medium text-loam-900"><Layers className="h-4 w-4" aria-hidden />{t('drone_missions.delivery.rasters')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('drone_missions.delivery.product')}>
            <Select value={product} onChange={(e) => setProduct(e.target.value as (typeof PRODUCTS)[number])}>
              {PRODUCTS.map((p) => <option key={p} value={p}>{t(`drone_pilots.data_types.${p}.name`)}</option>)}
            </Select>
          </Field>
          <Field label={t('drone_missions.delivery.captured_on')}>
            <Input type="date" value={capturedOn} onChange={(e) => setCapturedOn(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-loam-600">{t(`drone_missions.delivery.product_hint.${product}`)}</p>
        <input ref={rasterInput} type="file" accept={RASTER_ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sendRaster(f) }} />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => rasterInput.current?.click()}>{t('drone_missions.delivery.choose_raster')}</Button>
      </div>

      <div className="space-y-3 rounded-xl bg-loam-50 p-4">
        <p className="flex items-center gap-1.5 font-medium text-loam-900"><Image className="h-4 w-4" aria-hidden />{t('drone_missions.delivery.photos')}</p>
        <p className="text-sm text-loam-600">{t('drone_missions.delivery.photos_hint')}</p>
        <input ref={photoInput} type="file" multiple accept="image/*,video/*,.heic,.heif" className="sr-only"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) uploadActions.add(mission.map.id, files, { source: 'import', droneMissionId: mission.id }) }} />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" onClick={() => photoInput.current?.click()}>{t('drone_missions.delivery.choose_photos')}</Button>
          {photosSending > 0 && <span className="text-sm text-loam-600">{t('drone_missions.delivery.photos_sending', { count: photosSending })}</span>}
          {uploads.some((u) => u.status === 'error') && <span className="text-sm text-clay-700">{t('drone_missions.delivery.photos_failed')}</span>}
        </div>
      </div>

      <div className="space-y-3 rounded-xl bg-loam-50 p-4">
        <p className="flex items-center gap-1.5 font-medium text-loam-900"><FileUp className="h-4 w-4" aria-hidden />{t('drone_missions.delivery.files')}</p>
        <p className="text-sm text-loam-600">{t('drone_missions.delivery.files_hint')}</p>
        <input ref={fileInput} type="file" accept={FILE_ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sendFile(f) }} />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>{t('drone_missions.delivery.choose_file')}</Button>
      </div>
    </section>
  )
}
