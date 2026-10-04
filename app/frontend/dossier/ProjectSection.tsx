import { sectionTitle } from '@/components/journey/ProjectSheetParts'
import { formatNumber, t, translations } from '@/lib/i18n'
import { Muted, Section } from '@/dossier/parts'
import type { Dossier } from '@/types/dossier'
import type { SchemaField } from '@/types/journey'

type Texts = { label?: string; unit?: string; options?: Record<string, string>; item?: Record<string, Texts> }

const option = (texts: Texts, value: unknown) => texts.options?.[String(value)] ?? String(value)

/** A stored answer in words, or null when there is nothing to say. */
function answer(field: SchemaField, texts: Texts, value: unknown): string | null {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null
  switch (field.type) {
    case 'enum': return option(texts, value)
    case 'multi': return (value as unknown[]).map((v) => option(texts, v)).join(', ')
    case 'integer': return texts.unit ? `${formatNumber(Number(value))} ${texts.unit}` : formatNumber(Number(value))
    case 'boolean': return value === true ? t('dossier.project.yes_value') : null
    case 'text': return String(value)
    case 'list': {
      const items = (value as Record<string, unknown>[]).map((entry) => {
        const parts = (field.item ?? []).filter((f) => !f.hidden).map((f) => answer(f, texts.item?.[f.key] ?? {}, entry[f.key])).filter(Boolean)
        return parts.length ? `${parts[0]}${parts.length > 1 ? ` (${parts.slice(1).join(', ')})` : ''}` : null
      })
      return items.filter(Boolean).join(' · ') || null
    }
    default: return null
  }
}

/** The project sheet, answered sections only, in the words of the form. */
export function ProjectSection({ dossier, number, canEdit }: { dossier: Dossier; number: number; canEdit: boolean }) {
  const { values, schema, percent } = dossier.project
  const sections = schema.sections.map((section) => {
    const prefix = `journey.project.sections.${section.key}.fields`
    const answers = section.fields.filter((f) => !f.hidden).flatMap((field) => {
      const texts = translations(`${prefix}.${field.key}`) as Texts
      const text = answer(field, texts, values[section.key]?.[field.key])
      return text ? [{ key: field.key, label: field.key === 'notes' ? t('dossier.project.notes') : texts.label ?? field.key, text, long: field.type === 'text' }] : []
    })
    return { key: section.key, answers }
  }).filter((s) => s.answers.length > 0)

  return (
    <Section id="project" number={number} title={t('dossier.sections.project')}>
      {sections.length === 0 ? (
        <div className="space-y-2">
          <Muted>{t('dossier.project.empty')}</Muted>
          {canEdit && <a href={`/maps/${dossier.map.id}/project`} className="text-sm font-medium text-prune-700 hover:underline print:hidden">{t('dossier.project.fill')}</a>}
        </div>
      ) : (
        <>
          <p className="text-xs text-loam-500">{t('dossier.project.completion', { percent })}</p>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 print:grid-cols-2">
            {sections.map((section) => (
              <div key={section.key} className="dossier-keep">
                <h3 className="dossier-heading border-b border-loam-200 pb-1 text-sm font-semibold text-loam-900">{sectionTitle(section.key)}</h3>
                <dl className="mt-2 space-y-1.5">
                  {section.answers.map((a) => (
                    <div key={a.key}>
                      <dt className="text-[11px] text-loam-500">{a.label}</dt>
                      <dd className={a.long ? 'whitespace-pre-line text-loam-800' : 'text-loam-800'}>{a.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}
