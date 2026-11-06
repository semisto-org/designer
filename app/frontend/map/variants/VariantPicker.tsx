import { Layers2, SlidersHorizontal, Tag, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { setShownTag, useDrawingState } from '@/map/drawing/store'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'
import { showVariant, useShownVariant, useVariants } from './store'

/**
 * The project variant on the map (top left), in « Projet » only: the common
 * project and that variant's own elements. Anyone on the map can look at
 * another one; the retained one is marked ★. Only there when the map has
 * variants. A tag shown on its own (« Calques ») shows beside it, with its
 * way back to every element.
 */
export default function VariantPicker() {
  const editor = useEditor()
  const variants = useVariants((s) => s.variants)
  const shown = useShownVariant()
  const tag = useDrawingState((s) => s.shownTag)
  const withVariant = variants.length > 0 && shown != null && editor.mode === 'project'
  if (!withVariant && !tag) return null
  return (
    // The left zone while no panel is open (the panel outranks it); on a phone, in the foot of the map (map/layout/zones).
    <ZoneCard id="variant" zone={{ desktop: 'left', phone: 'bottom' }} priority={PRIORITY.variant} order={0} className="items-start gap-1.5">
      {withVariant && shown && (
      <div
        title={t('variants.picker_hint')}
        className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1 text-sm text-loam-600 shadow-[0_6px_16px_rgb(26_26_26/0.14)] focus-within:ring-2 focus-within:ring-prune-600 md:mt-1.5 md:ml-1"
      >
        <Layers2 className="h-4 w-4 shrink-0" aria-hidden />
        <select
          value={shown.id}
          onChange={(e) => showVariant(Number(e.target.value))}
          aria-label={t('variants.picker_label')}
          className={`max-w-[11rem] truncate rounded-full border-0 py-1 pl-2.5 pr-7 text-sm focus:ring-0 ${shown.retained ? 'bg-leaf-600 text-white' : 'bg-prune-600 text-white'}`}
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>{v.retained ? t('variants.option_retained', { name: v.name }) : v.name}</option>
          ))}
        </select>
        <IconButton size="sm" label={t('variants.open_panel')} onClick={() => editor.openPanel('variants')}>
          <SlidersHorizontal />
        </IconButton>
      </div>
      )}
      {tag && (
        <div className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1 text-sm text-loam-800 shadow-[0_6px_16px_rgb(26_26_26/0.14)] md:ml-1">
          <Tag className="h-4 w-4 shrink-0 text-prune-700" aria-hidden />
          <span className="max-w-[10rem] truncate">{tag}</span>
          <IconButton size="sm" label={t('tags.shown_all')} onClick={() => setShownTag(null)}><X /></IconButton>
        </div>
      )}
    </ZoneCard>
  )
}
