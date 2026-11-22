import { Copy, Layers, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'
import { copyToVariant } from './api'
import { compareWith, pickCompared, setCompareFade, useCompareState } from './compare'
import { useVariants } from './store'

/**
 * At the top of the map while a teammate's sketch lies over one's own: who
 * is on whom, a fade between the two, and the element picked on it, ready
 * to be copied into the sketch shown or into the common project. The
 * original stays in its sketch.
 */
export default function CompareCard({ other, shown, empty }: { other: number; shown: number; empty: boolean }) {
  const editor = useEditor()
  const fade = useCompareState((s) => s.fade)
  const picked = useCompareState((s) => s.picked)
  const variants = useVariants((s) => s.variants)
  const [busy, setBusy] = useState(false)
  const sliderId = useId()
  const nameOf = (id: number) => variants.find((v) => v.id === id)?.name ?? ''
  const pickedFeature = picked != null ? editor.features.find((f) => f.properties.id === picked) ?? null : null
  const label = pickedFeature ? (pickedFeature.properties.name?.trim() || t(`editor.kinds.${pickedFeature.properties.kind}`)) : ''

  async function copy(into: number | null) {
    if (!pickedFeature) return
    setBusy(true)
    try {
      const made = await copyToVariant(editor, pickedFeature.properties.id, into)
      editor.notify(t('variants.copied', { name: into == null ? t('variants.common_short') : nameOf(into) }))
      pickCompared(null)
      if (made) editor.select(made.properties.id)
    } catch (error) {
      editor.notify((error as Error).message || t('variants.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ZoneCard id="variant-compare" zone="top" priority={PRIORITY.notice} className="w-full md:w-[30rem]">
      <section aria-label={t('variants.compare_title', { other: nameOf(other), shown: nameOf(shown) })} className="pointer-events-auto rounded-2xl bg-loam-50/95 p-3 shadow-lg ring-1 ring-leaf-200 backdrop-blur">
        <div className="flex items-start gap-2">
          <Layers className="mt-1 h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
          <p className="min-w-0 flex-1 font-serif text-lg leading-tight text-loam-900">{t('variants.compare_title', { other: nameOf(other), shown: nameOf(shown) })}</p>
          <IconButton size="sm" label={t('variants.compare_close')} onClick={() => compareWith(null)}><X aria-hidden /></IconButton>
        </div>
        <div className="mt-2">
          <label htmlFor={sliderId} className="sr-only">{t('variants.compare_fade')}</label>
          <div className="flex items-center gap-2 text-sm text-loam-600">
            <span className="max-w-[8rem] truncate">{nameOf(shown)}</span>
            <input id={sliderId} type="range" min={0} max={1} step={0.05} value={fade} onChange={(e) => setCompareFade(Number(e.target.value))} className="min-w-0 flex-1 accent-leaf-700" />
            <span className="max-w-[8rem] truncate">{nameOf(other)}</span>
          </div>
        </div>
        {empty ? (
          <p className="mt-2 text-sm text-loam-600">{t('variants.compare_empty')}</p>
        ) : pickedFeature && editor.canEdit ? (
          <div className="mt-2 space-y-2 rounded-xl bg-white p-2 ring-1 ring-loam-200">
            <p className="truncate text-sm text-loam-800">{label}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void copy(shown)}>
                <Copy className="h-4 w-4" aria-hidden />{t('variants.compare_copy')}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void copy(null)}>
                <Copy className="h-4 w-4" aria-hidden />{t('variants.compare_copy_common')}
              </Button>
            </div>
          </div>
        ) : (
          editor.canEdit && <p className="mt-2 hidden text-sm text-loam-600 md:block">{t('variants.compare_pick')}</p>
        )}
      </section>
    </ZoneCard>
  )
}
