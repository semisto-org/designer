import { Camera, MoveVertical, ScanLine, SquareDashed } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { headingLabel } from '@/map/photos/format'
import type { MapPhotoData, PhotoCameraData } from '@/types/soil_photos'

const number = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 })
/** Diagonal of a 35 mm frame: the reference of « focal length in 35 mm ». */
const FULL_FRAME_DIAGONAL_MM = 43.27
/** Below this gimbal pitch the drone looks straight down at the ground. */
const NADIR_PITCH = -80

/**
 * Ground covered by a photo taken straight down, in meters (width × height),
 * from the drone's height and the 35 mm equivalent focal length. Approximate:
 * the height is measured from the take-off point, not from the ground below.
 */
export function groundFootprint(camera: PhotoCameraData, aspect: number): [number, number] | null {
  const { relative_altitude_m: height, focal_length_35mm: focal, gimbal_pitch: pitch } = camera
  if (!height || height <= 0 || !focal || pitch == null || pitch > NADIR_PITCH) return null
  const diagonal = (height * FULL_FRAME_DIAGONAL_MM) / focal
  const factor = Math.sqrt(1 + aspect * aspect)
  return [Math.round((diagonal * aspect) / factor), Math.round(diagonal / factor)]
}

/** « Inclinée de 30° sous l'horizon, vers Nord-ouest (302°) » */
function gimbalLabel(camera: PhotoCameraData): string | null {
  const { gimbal_pitch: pitch, gimbal_yaw: yaw } = camera
  if (pitch == null) return null
  if (pitch <= NADIR_PITCH) return t('soil_photos.camera.straight_down')
  const toward = yaw != null ? t('soil_photos.camera.toward', { heading: headingLabel(yaw) }) : ''
  if (pitch > -5) return t('soil_photos.camera.level', { toward })
  return t('soil_photos.camera.tilted', { degrees: number.format(Math.round(-pitch)), toward })
}

/** « 24 mm · f/2,8 · 1/500 s · ISO 100 » */
function settingsLabel(camera: PhotoCameraData): string | null {
  const parts = [
    camera.focal_length_35mm ? t('soil_photos.camera.focal', { mm: number.format(camera.focal_length_35mm) }) : null,
    camera.f_number ? `f/${number.format(camera.f_number)}` : null,
    camera.exposure_time ? `${camera.exposure_time} s` : null,
    camera.iso ? `ISO ${camera.iso}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** What the photo file says about how it was taken: the camera, and for a drone its height and gimbal. */
export function PhotoCameraDetails({ photo }: { photo: MapPhotoData }) {
  const camera = photo.camera
  if (!camera) return null
  const device = camera.model_name ?? [camera.make, camera.model].filter(Boolean).join(' ')
  const settings = settingsLabel(camera)
  const gimbal = camera.drone ? gimbalLabel(camera) : null
  const aspect = photo.width && photo.height ? photo.width / photo.height : 4 / 3
  const footprint = camera.drone ? groundFootprint(camera, aspect) : null
  const height = camera.drone ? camera.relative_altitude_m : undefined
  if (!device && !settings && height == null && !gimbal) return null

  return (
    <section aria-labelledby="photo-camera-title">
      <h3 id="photo-camera-title" className="text-xs font-semibold uppercase tracking-wide text-loam-500">
        {camera.drone ? t('soil_photos.camera.title_drone') : t('soil_photos.camera.title')}
      </h3>
      <dl className="mt-1.5 space-y-1.5 text-sm">
        {(device || settings) && (
          <Row icon={<Camera className="h-4 w-4" />} label={t('soil_photos.camera.device')}>
            {device && <dd>{device}</dd>}
            {settings && <dd className="text-xs text-loam-500">{settings}</dd>}
          </Row>
        )}
        {height != null && (
          <Row icon={<MoveVertical className="h-4 w-4" />} label={t('soil_photos.camera.height')}>
            <dd>{t('soil_photos.camera.above_takeoff', { meters: number.format(Math.round(height)) })}</dd>
            {camera.absolute_altitude_m != null && (
              <dd className="text-xs text-loam-500">{t('soil_photos.camera.above_sea', { meters: number.format(Math.round(camera.absolute_altitude_m)) })}</dd>
            )}
          </Row>
        )}
        {gimbal && (
          <Row icon={<ScanLine className="h-4 w-4" />} label={t('soil_photos.camera.gimbal')}>
            <dd>{gimbal}</dd>
          </Row>
        )}
        {footprint && (
          <Row icon={<SquareDashed className="h-4 w-4" />} label={t('soil_photos.camera.footprint')}>
            <dd>{t('soil_photos.camera.covers', { width: number.format(footprint[0]), height: number.format(footprint[1]) })}</dd>
            <dd className="text-xs text-loam-500">{t('soil_photos.camera.covers_hint')}</dd>
          </Row>
        )}
      </dl>
      {camera.drone && <p className="mt-2 text-xs text-loam-500">{t('soil_photos.camera.drone_hint')}</p>}
    </section>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-loam-400">{icon}</span>
      <div>
        <dt className="sr-only">{label}</dt>
        {children}
      </div>
    </div>
  )
}
