import clsx from 'clsx'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import type { DroneDataType, DroneFeature, MissionStatus } from '@/types/drone_pilots'
import type { PillTone } from '@/components/ui/Pill'

// Matches DroneCatalog::DATA_TYPES and FEATURES.
export const DATA_TYPES: DroneDataType[] = ['photos', 'video', 'panorama', 'orthophoto', 'elevation', 'thermal', 'multispectral', 'point_cloud', 'model_3d']
export const FEATURES: DroneFeature[] = ['rtk', 'lidar', 'thermal', 'multispectral']

export const STATUS_TONES: Record<MissionStatus, PillTone> = {
  requested: 'humus', accepted: 'prune', declined: 'neutral', cancelled: 'neutral',
  paid: 'prune', delivered: 'leaf', completed: 'leaf', refunded: 'neutral',
}

/** A drone's name: the DJI model from the catalogue, or what the pilot typed for another one. */
export function droneName(drone: { model: string; name: string | null }) {
  return drone.model === 'other' ? drone.name ?? t('drone_pilots.drones.other') : t(`drone_pilots.drones.${drone.model}`)
}

/** A checkbox drawn as a pill, for filters and multiple choices. */
export function ToggleChip({ checked, onChange, children, disabled }: { checked: boolean; onChange: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label
      className={clsx(
        'inline-flex cursor-pointer select-none items-center rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-prune-600',
        checked ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200 hover:bg-prune-50',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} disabled={disabled} />
      {children}
    </label>
  )
}
