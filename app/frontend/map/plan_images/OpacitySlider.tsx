import { useEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { type PlanImage, planImagesStore } from '@/map/plan_images/store'

const SAVE_AFTER_MS = 400

/** The image's opacity: shown at once while sliding, saved when the hand rests. */
export default function OpacitySlider({ image, className }: { image: PlanImage; className?: string }) {
  const { notify, canEdit } = useEditor()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const percent = Math.round(image.opacity * 100)

  const change = (value: number) => {
    const opacity = value / 100
    planImagesStore.preview(image.id, { opacity })
    if (!canEdit) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      planImagesStore.update(image.id, { opacity }).catch((error: Error) => notify(error.message, 'error'))
    }, SAVE_AFTER_MS)
  }

  return (
    <label className={className}>
      <span className="flex items-center justify-between text-xs text-loam-600">
        {t('plan_images.opacity')}
        <span className="tabular-nums">{percent} %</span>
      </span>
      <input
        type="range"
        min={5}
        max={100}
        step={5}
        value={percent}
        onChange={(e) => change(Number(e.target.value))}
        aria-valuetext={`${percent} %`}
        className="mt-1 h-1.5 w-full cursor-pointer accent-prune-600"
      />
    </label>
  )
}
