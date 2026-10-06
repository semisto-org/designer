import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { COLOR_SWATCHES, elementFor, featureColor, GENERIC_KINDS, storedProperties } from '@/map/drawing/catalog'
import { computedValues } from '@/map/drawing/computed'
import { saveFeature } from '@/map/drawing/save'
import ShapeEditButton from '@/map/drawing/ShapeEditButton'
import { linkedSourceId } from '@/map/water/store'
import type { MapFeature } from '@/types'
import type { ElementField } from '@/types/drawing'

/** Library elements and generic shapes get this inspector section. */
export function appliesToElement(feature: MapFeature): boolean {
  return elementFor(feature.properties.kind) != null || GENERIC_KINDS.includes(feature.properties.kind)
}

function display(field: ElementField, value: unknown): string {
  if (value == null || value === '') return t('drawing.element.none')
  if (field.type === 'select') return t(`drawing.options.${field.key}.${value}`)
  if (field.type === 'number' || field.type === 'integer') return `${formatNumber(Number(value))}${field.unit ? ` ${field.unit}` : ''}`
  return String(value)
}

/** One property input, saved on blur (text, numbers) or on change (choices). */
function PropertyField({ field, value, disabled, onSave }: {
  field: ElementField; value: unknown; disabled: boolean; onSave: (value: unknown) => void
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  const label = t(`drawing.fields.${field.key}`)

  if (field.readonly || disabled) {
    if (field.type === 'boolean') {
      return <div className="flex justify-between gap-2 text-sm"><span className="text-loam-500">{label}</span><span>{value === true ? t('drawing.element.yes') : t('drawing.element.none')}</span></div>
    }
    return <div className="flex justify-between gap-2 text-sm"><span className="text-loam-500">{label}</span><span className="text-right">{display(field, value)}</span></div>
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-loam-700">
        {label}
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onSave(e.target.checked)}
          className="h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
        />
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <Field label={label}>
        <Select value={draft} onChange={(e) => onSave(e.target.value || null)}>
          <option value="">{t('drawing.element.none')}</option>
          {field.options?.map((option) => <option key={option} value={option}>{t(`drawing.options.${field.key}.${option}`)}</option>)}
        </Select>
      </Field>
    )
  }

  const numeric = field.type === 'number' || field.type === 'integer'
  const commit = () => {
    if (draft === (value == null ? '' : String(value))) return
    if (!numeric) return onSave(draft.trim() || null)
    if (draft.trim() === '') return onSave(null)
    const parsed = Number(draft.replace(',', '.'))
    if (!Number.isFinite(parsed)) return setDraft(value == null ? '' : String(value))
    onSave(field.type === 'integer' ? Math.round(parsed) : parsed)
  }
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type={numeric ? 'number' : 'text'}
          inputMode={numeric ? (field.type === 'integer' ? 'numeric' : 'decimal') : undefined}
          min={field.min}
          max={field.max}
          step={field.step ?? (field.type === 'integer' ? 1 : 'any')}
          maxLength={numeric ? undefined : 200}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={field.unit ? 'pr-12' : undefined}
        />
        {field.unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-loam-400">{field.unit}</span>}
      </div>
    </Field>
  )
}

/**
 * Inspector section of a library element: its properties (generic form from
 * the library's field schema), derived estimates, colour and shape editing.
 */
export default function ElementSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const spec = elementFor(feature.properties.kind)
  const id = feature.properties.id
  const stored = storedProperties(feature)
  const color = featureColor(feature)
  const ownColor = typeof feature.properties.style?.color === 'string'
  const computed = spec ? computedValues(feature, spec) : []
  // A tap fed by a water source takes its potability (WaterSourceSection).
  const fields = (spec?.fields ?? []).filter((field) => !(field.key === 'potable' && linkedSourceId(feature) != null))

  function saveProperty(key: string, value: unknown) {
    const next = { ...stored }
    if (value == null) delete next[key]
    else next[key] = value
    void saveFeature(editor, id, { properties: next })
  }

  function saveColor(next: string | null) {
    const style = { ...(feature.properties.style ?? {}) }
    if (next) style.color = next
    else delete style.color
    void saveFeature(editor, id, { style })
  }

  return (
    <div className="space-y-4 border-t border-loam-100 pt-3">
      {fields.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('drawing.element.properties')}</h3>
          {fields.map((field) => (
            <PropertyField key={field.key} field={field} value={stored[field.key]} disabled={!editor.canEdit} onSave={(v) => saveProperty(field.key, v)} />
          ))}
        </section>
      )}

      {computed.length > 0 && (
        <section className="rounded-lg bg-leaf-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-leaf-700">{t('drawing.computed.title')}</h3>
          <dl className="mt-1.5 space-y-1.5">
            {computed.map((c) => (
              <div key={c.key}>
                <dt className="text-xs text-loam-600">{c.label}</dt>
                <dd className="text-sm font-semibold text-loam-900">{c.value}</dd>
                <dd className="text-xs text-loam-500">{c.hint}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {editor.canEdit && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('drawing.element.color')}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('drawing.element.color')}>
            {[...new Set([spec?.color ?? color, ...COLOR_SWATCHES])].map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={color === swatch}
                aria-label={swatch}
                onClick={() => saveColor(swatch === spec?.color ? null : swatch)}
                className={clsx('grid h-6 w-6 place-items-center rounded-full ring-1 ring-loam-300', color === swatch && 'ring-2 ring-prune-600 ring-offset-1')}
                style={{ background: swatch }}
              >
                {color === swatch && <Check className={clsx('h-3 w-3', swatch === '#ffffff' ? 'text-loam-900' : 'text-white')} />}
              </button>
            ))}
            {ownColor && (
              <button type="button" onClick={() => saveColor(null)} className="ml-1 text-xs text-prune-700 underline-offset-2 hover:underline">
                {t('drawing.element.color_reset')}
              </button>
            )}
          </div>
        </section>
      )}

      <ShapeEditButton feature={feature} />
    </div>
  )
}
