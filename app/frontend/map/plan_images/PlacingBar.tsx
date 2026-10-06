import { Move } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { type PlanImage, planImagesStore } from '@/map/plan_images/store'

function formatWidth(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 2 })} km`
    : `${meters.toLocaleString('fr-BE', { maximumFractionDigits: 1 })} m`
}

/** A one-line reminder over the map while an image is being placed, with « Terminer ». */
export default function PlacingBar({ image }: { image: PlanImage }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 top-28 z-20 flex justify-center md:top-[4.5rem]">
      <section
        aria-label={t('plan_images.placing.title', { name: image.name })}
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 shadow-lg ring-1 ring-prune-200"
      >
        <Move className="h-4 w-4 shrink-0 text-prune-700" />
        <span className="truncate text-sm font-semibold text-loam-900">{t('plan_images.placing.title', { name: image.name })}</span>
        <Button size="sm" onClick={() => planImagesStore.place(null)}>{t('plan_images.placing.done')}</Button>
      </section>
    </div>
  )
}

/** In the panel, under the image being placed: what to do, its rotation and width. */
export function PlacingDetails({ image, onRotate }: { image: PlanImage; onRotate: (rotation: number) => void }) {
  const shown = (Math.round(image.rotation * 10) / 10).toLocaleString('fr-BE')
  const [rotation, setRotation] = useState(shown)
  useEffect(() => setRotation(shown), [shown])

  const commit = () => {
    const value = Number(rotation.replace(',', '.'))
    if (Number.isFinite(value)) onRotate(((value % 360) + 360) % 360)
  }

  return (
    <div className="mt-2 space-y-2 pl-10">
      <p className="text-xs leading-snug text-loam-600">{t('plan_images.placing.hint')}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex items-center gap-1.5 text-xs text-loam-600">
          {t('plan_images.placing.rotation')}
          <input
            inputMode="decimal"
            value={rotation}
            onChange={(e) => setRotation(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
            className="w-16 rounded-lg border-loam-200 px-2 py-1 text-sm tabular-nums focus:border-prune-500 focus:ring-prune-500"
          />
          °
        </label>
        <span className="whitespace-nowrap text-xs tabular-nums text-loam-600">{t('plan_images.placing.width', { width: formatWidth(image.widthM) })}</span>
      </div>
    </div>
  )
}
