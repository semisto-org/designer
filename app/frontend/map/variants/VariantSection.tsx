import { Field, Select } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { isAnnotationLayer, isPlanned } from '@/map/scenario'
import type { MapFeature } from '@/types'
import { showVariant, useVariants, variantStore } from './store'
import { variantOf } from './variants'

/** A project element (or a note, a zone) on a map that has variants. */
export function appliesToVariant(feature: MapFeature): boolean {
  const p = feature.properties
  if (variantStore.get().variants.length === 0 || p.status === 'rejected') return false
  return isPlanned(p) || isAnnotationLayer(p.layer) || p.status === 'draft'
}

/**
 * Inspector section « Variante »: common to every variant, or this one's
 * own. Moving it to another variant shows that variant, so the element
 * stays in view.
 */
export default function VariantSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const variants = useVariants((s) => s.variants)
  const own = variantOf(feature.properties)

  async function move(value: string) {
    const id = value ? Number(value) : null
    try {
      await editor.updateFeature(feature.properties.id, { variant_id: id })
      if (id != null) showVariant(id)
      const name = variants.find((v) => v.id === id)?.name
      editor.notify(name ? t('variants.moved', { name }) : t('variants.moved_common'))
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="text-sm font-semibold text-loam-600">{t('variants.section_title')}</h3>
      {editor.canEdit ? (
        <Field hint={t('variants.section_hint')}>
          <Select value={own ?? ''} onChange={(e) => void move(e.target.value)} aria-label={t('variants.section_title')}>
            <option value="">{t('variants.common')}</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.retained ? t('variants.option_retained', { name: v.name }) : v.name}</option>)}
          </Select>
        </Field>
      ) : (
        <p className="text-sm text-loam-700">{variants.find((v) => v.id === own)?.name ?? t('variants.common')}</p>
      )}
    </section>
  )
}
