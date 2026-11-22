import { Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import { copyToVariant } from './api'
import { showVariant, useVariants } from './store'
import { variantOf } from './variants'

/**
 * Inspector section « Variante », for a project element (or a note, a
 * zone, a sketch) on a map that has variants: common to every variant, or
 * this one's own. Moving it to another variant shows that variant, so the
 * element stays in view. Copying it leaves it where it is: the way to take
 * an idea from a teammate's sketch into the common project or a proposal.
 */
export default function VariantSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const variants = useVariants((s) => s.variants)
  const own = variantOf(feature.properties)
  // Where a copy can go: the common project (from a variant), or another variant.
  const targets = [...(own != null ? [null] : []), ...variants.filter((v) => v.id !== own).map((v) => v.id)]
  const [target, setTarget] = useState<string>('')
  const [copying, setCopying] = useState(false)
  const chosen = targets.some((id) => String(id ?? '') === target) ? (target ? Number(target) : null) : targets[0]
  const nameOf = (id: number | null | undefined) => (id == null ? t('variants.common_short') : variants.find((v) => v.id === id)?.name ?? '')

  async function copy() {
    if (chosen === undefined) return
    setCopying(true)
    try {
      const made = await copyToVariant(editor, feature.properties.id, chosen)
      editor.notify(t('variants.copied', { name: nameOf(chosen) }))
      // The copy is where it went: show it there, selected.
      if (made) {
        showVariant(chosen)
        editor.select(made.properties.id)
      }
    } catch (error) {
      editor.notify((error as Error).message || t('variants.error'), 'error')
    } finally {
      setCopying(false)
    }
  }

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
        <>
          <Field hint={t('variants.section_hint')}>
            <Select value={own ?? ''} onChange={(e) => void move(e.target.value)} aria-label={t('variants.section_title')}>
              <option value="">{t('variants.common')}</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.retained ? t('variants.option_retained', { name: v.name }) : v.name}</option>)}
            </Select>
          </Field>
          {targets.length > 0 && (
            <div className="flex items-end gap-2">
              <Field label={t('variants.copy_label')} className="min-w-0 flex-1">
                <Select value={String(chosen ?? '')} onChange={(e) => setTarget(e.target.value)}>
                  {targets.map((id) => <option key={id ?? 'common'} value={id ?? ''}>{nameOf(id)}</option>)}
                </Select>
              </Field>
              <Button size="sm" variant="secondary" disabled={copying} onClick={() => void copy()}>
                <Copy className="h-4 w-4" aria-hidden />{t('variants.copy')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-loam-700">{variants.find((v) => v.id === own)?.name ?? t('variants.common')}</p>
      )}
    </section>
  )
}
