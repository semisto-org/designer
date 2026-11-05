import clsx from 'clsx'
import { Copy, Eye, Footprints, GitBranchPlus, Hourglass, Pencil, Star, Tag, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { isPlanned } from '@/map/scenario'
import { tagCounts } from '@/map/tags/tags'
import { createVariant, deleteVariant, duplicateVariant, updateVariant } from './api'
import { showVariant, useShownVariant, useVariants } from './store'
import { ownCounts, variantOf, type MapVariant } from './variants'

/**
 * « Variantes »: several ideas for the same place (« Projet 1 », « Projet
 * 2 »). Each keeps its own elements, the common project stays in all of
 * them; the map shows one at a time, in « Projet ». The retained one is
 * what the palette, the offer, the implementation plan, the 3D view and
 * the public map count. Opening the panel shows the project.
 */
export default function VariantsPanel() {
  const editor = useEditor()
  const variants = useVariants((s) => s.variants)
  const shown = useShownVariant()
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<number | null>(null)
  const counts = useMemo(() => ownCounts(editor.features), [editor.features])
  const common = editor.features.filter((f) => f.properties.status === 'active' && variantOf(f.properties) == null && isPlanned(f.properties)).length
  // Tags still carried by planned elements outside any variant: the former « Version » picker.
  const tags = useMemo(
    () => tagCounts(editor.features.filter((f) => f.properties.status === 'active' && isPlanned(f.properties) && variantOf(f.properties) == null))
      .filter(({ tag }) => !variants.some((v) => v.name.toLocaleLowerCase('fr') === tag.toLocaleLowerCase('fr'))),
    [editor.features, variants],
  )
  const [tag, setTag] = useState('')

  // Variants are a project matter: the panel looks at the project.
  const setMode = editor.setMode
  useEffect(() => setMode('project'), [setMode])

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    try {
      return await work()
    } catch (error) {
      editor.notify((error as Error).message || t('variants.error'), 'error')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function retain(variant: MapVariant) {
    const saved = await run(() => updateVariant(editor, variant.id, { retained: true }))
    if (saved) editor.notify(t('variants.retained_done', { name: saved.name }))
  }

  async function duplicate(variant: MapVariant) {
    const copy = await run(() => duplicateVariant(editor, variant.id))
    if (copy) editor.notify(t('variants.duplicated', { name: copy.name }))
  }

  async function remove(variant: MapVariant) {
    const count = counts.get(variant.id) ?? 0
    const ok = await confirmAction({
      title: t('variants.delete_title', { name: variant.name }),
      body: t('variants.delete_body', { count }),
      note: count > 0 ? t('variants.delete_note') : undefined,
      confirmLabel: t('variants.delete'),
      tone: 'danger',
    })
    if (!ok) return
    const done = await run(() => deleteVariant(editor, variant.id))
    if (done !== null) editor.notify(t('variants.deleted'))
  }

  async function rename(variant: MapVariant, name: string) {
    setRenaming(null)
    const next = name.trim()
    if (!next || next === variant.name) return
    await run(() => updateVariant(editor, variant.id, { name: next }))
  }

  async function fromTag() {
    const chosen = tag || tags[0]?.tag
    if (!chosen) return
    const created = await run(() => createVariant(editor, { fromTag: chosen }))
    if (created) editor.notify(t('variants.from_tag_done', { name: created.name }))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('variants.intro')}</p>

      {variants.length === 0 ? (
        <section className="space-y-2 rounded-xl bg-loam-50 p-3 ring-1 ring-loam-100">
          <h3 className="font-serif text-lg text-loam-900">{t('variants.empty_title')}</h3>
          <p className="text-sm text-loam-600">{t('variants.empty')}</p>
          {editor.canEdit && (
            <Button size="sm" disabled={busy} onClick={() => void run(() => createVariant(editor))}>
              <GitBranchPlus className="h-4 w-4" />{t('variants.start')}
            </Button>
          )}
        </section>
      ) : (
        <>
          <p className="text-sm text-loam-500">{t('variants.retained_intro')}</p>
          <ul className="space-y-2">
            {variants.map((variant) => {
              const isShown = shown?.id === variant.id
              return (
                <li key={variant.id} className={clsx('rounded-xl p-3 ring-1', isShown ? 'bg-prune-50/60 ring-prune-200' : 'bg-white ring-loam-200')}>
                  <div className="flex items-center gap-2">
                    {renaming === variant.id ? (
                      <Input
                        autoFocus
                        defaultValue={variant.name}
                        maxLength={60}
                        aria-label={t('variants.name_label')}
                        onBlur={(e) => void rename(variant, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename(variant, e.currentTarget.value)
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-medium text-loam-900">{variant.name}</span>
                    )}
                    {variant.retained && <Pill tone="leaf" icon={<Star className="h-3.5 w-3.5" />}>{t('variants.retained')}</Pill>}
                  </div>
                  <p className="mt-1 text-sm text-loam-500">{t('variants.own_count', { count: counts.get(variant.id) ?? 0 })}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {isShown ? (
                      <Pill tone="prune" icon={<Eye className="h-3.5 w-3.5" />}>{t('variants.shown')}</Pill>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => showVariant(variant.id)}>
                        <Eye className="h-4 w-4" />{t('variants.show')}
                      </Button>
                    )}
                    {editor.canEdit && !variant.retained && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void retain(variant)}>
                        <Star className="h-4 w-4" />{t('variants.retain')}
                      </Button>
                    )}
                    {editor.canEdit && (
                      <span className="ml-auto flex items-center">
                        <IconButton size="sm" label={t('variants.rename')} onClick={() => setRenaming(variant.id)}><Pencil /></IconButton>
                        <IconButton size="sm" label={t('variants.duplicate')} disabled={busy} onClick={() => void duplicate(variant)}><Copy /></IconButton>
                        <IconButton size="sm" tone="danger" label={t('variants.delete')} disabled={busy} onClick={() => void remove(variant)}><Trash2 /></IconButton>
                      </span>
                    )}
                  </div>
                  {isShown && (
                    <NotesField key={variant.id} variant={variant} readOnly={!editor.canEdit} onSave={(notes) => void run(() => updateVariant(editor, variant.id, { notes }))} />
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-sm text-loam-500">{t('variants.common_count', { count: common })}</p>
          <div className="flex flex-wrap gap-2">
            {editor.canEdit && (
              <Button size="sm" disabled={busy} onClick={() => void run(() => createVariant(editor))}>
                <GitBranchPlus className="h-4 w-4" />{t('variants.new')}
              </Button>
            )}
            {/* The time of living things: two ideas part ways when the trees have grown. */}
            <Button size="sm" variant="ghost" onClick={() => editor.setMoment('year15')}>
              <Hourglass className="h-4 w-4" />{t('variants.see_in_years')}
            </Button>
          </div>
          <p className="flex gap-2 rounded-lg bg-leaf-50 px-3 py-2 text-sm text-loam-700 ring-1 ring-leaf-100">
            <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
            <span><span className="font-medium text-loam-900">{t('variants.go_outside_title')} </span>{t('variants.go_outside')}</span>
          </p>
        </>
      )}

      {editor.canEdit && tags.length > 0 && (
        <section className="space-y-2 border-t border-loam-100 pt-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-900"><Tag className="h-4 w-4" aria-hidden />{t('variants.from_tag_title')}</h3>
          <p className="text-sm text-loam-600">{t('variants.from_tag_intro')}</p>
          <div className="flex items-end gap-2">
            <Field label={t('variants.from_tag_label')} className="flex-1">
              <Select value={tag || tags[0].tag} onChange={(e) => setTag(e.target.value)}>
                {tags.map(({ tag: name, count }) => <option key={name} value={name}>{`${name} (${count})`}</option>)}
              </Select>
            </Field>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void fromTag()}>{t('variants.from_tag')}</Button>
          </div>
        </section>
      )}
    </div>
  )
}

/** The idea of the variant, saved when the field is left. */
function NotesField({ variant, readOnly, onSave }: { variant: MapVariant; readOnly: boolean; onSave: (notes: string | null) => void }) {
  const [notes, setNotes] = useState(variant.notes ?? '')
  if (readOnly) return variant.notes ? <p className="mt-2 whitespace-pre-line text-sm text-loam-700">{variant.notes}</p> : null
  return (
    <Field label={t('variants.notes_label')} className="mt-2">
      <Textarea
        rows={2}
        maxLength={4000}
        value={notes}
        placeholder={t('variants.notes_placeholder')}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          const next = notes.trim() || null
          if (next !== (variant.notes ?? null)) onSave(next)
        }}
      />
    </Field>
  )
}
