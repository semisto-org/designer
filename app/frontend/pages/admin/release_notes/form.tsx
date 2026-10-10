import { Head, Link, useForm } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { NoteCard } from '@/release_notes/NoteCard'
import type { AdminReleaseNote, ReleaseNoteEntry } from '@/types/releaseNotes'

const PATH = '/admin/release-notes'

type FormData = {
  title: string
  body: string
  published_on: string
  link_path: string
  link_label: string
  screenshot_alt: string
  screenshot: File | null
  remove_screenshot: '0' | '1'
  published: boolean
}

const today = () => new Date().toLocaleDateString('sv-SE')

/** Write or edit a « Nouveautés » entry, with the page's own card as a live preview. */
export default function AdminReleaseNoteForm({ note }: { note: AdminReleaseNote | null }) {
  const form = useForm<FormData>({
    title: note?.title ?? '',
    body: note?.body ?? '',
    published_on: note?.publishedOn ?? today(),
    link_path: note?.linkPath ?? '',
    link_label: note?.linkLabel ?? '',
    screenshot_alt: note?.screenshotAlt ?? '',
    screenshot: null,
    remove_screenshot: '0',
    published: note?.published ?? false,
  })
  const errors = form.errors as Partial<Record<keyof FormData, string>>
  const fileUrl = useObjectUrl(form.data.screenshot)
  const screenshotUrl = fileUrl ?? (form.data.remove_screenshot === '1' ? null : note?.screenshotUrl ?? null)

  const preview: ReleaseNoteEntry = useMemo(() => ({
    id: note?.id ?? 0,
    title: form.data.title || '…',
    paragraphs: form.data.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    publishedOn: form.data.published_on || today(),
    link: form.data.link_path ? { path: form.data.link_path, label: form.data.link_label || null } : null,
    screenshot: screenshotUrl ? { url: screenshotUrl, alt: form.data.screenshot_alt || form.data.title } : null,
    fresh: true,
    likes: [],
    likesCount: note?.likesCount ?? 0,
    liked: false,
  }), [form.data, screenshotUrl, note])

  return (
    <div>
      <Head title={t(note ? 'release_notes.admin.edit_title' : 'release_notes.admin.new_title')} />
      <AdminNav />
      <Link href={PATH} className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('release_notes.admin.back')}
      </Link>
      <h1 className="mt-3 text-2xl">{t(note ? 'release_notes.admin.edit_title' : 'release_notes.admin.new_title')}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              form.transform((data) => ({
                ...(note ? { _method: 'patch' } : {}),
                release_note: { ...data, published: data.published ? '1' : '0', screenshot: data.screenshot ?? undefined },
              }))
              form.post(note ? `${PATH}/${note.id}` : PATH, { forceFormData: true, preserveScroll: true })
            }}
          >
            <Field label={t('activerecord.attributes.release_note.title')} hint={t('release_notes.admin.form.title_hint')} error={errors.title}>
              <Input required maxLength={120} value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} />
            </Field>
            <Field label={t('activerecord.attributes.release_note.published_on')} error={errors.published_on}>
              <Input type="date" required value={form.data.published_on} onChange={(e) => form.setData('published_on', e.target.value)} className="w-44!" />
            </Field>
            <Field label={t('activerecord.attributes.release_note.body')} hint={t('release_notes.admin.form.body_hint')} error={errors.body}>
              <Textarea required rows={8} maxLength={4000} value={form.data.body} onChange={(e) => form.setData('body', e.target.value)} />
            </Field>
            <Field label={t('activerecord.attributes.release_note.screenshot')} hint={t('release_notes.admin.form.screenshot_hint')} error={errors.screenshot}>
              <input
                type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(e) => form.setData((data) => ({ ...data, screenshot: e.target.files?.[0] ?? null, remove_screenshot: '0' }))}
                className="block w-full text-sm text-loam-600 file:mr-3 file:rounded-full file:border-0 file:bg-prune-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-prune-700 hover:file:bg-prune-100"
              />
            </Field>
            {note?.screenshotUrl && !form.data.screenshot && (
              <label className="flex items-center gap-2 text-sm text-loam-600">
                <input type="checkbox" checked={form.data.remove_screenshot === '1'} onChange={(e) => form.setData('remove_screenshot', e.target.checked ? '1' : '0')} />
                {t('release_notes.admin.form.remove_screenshot')}
              </label>
            )}
            <Field label={t('activerecord.attributes.release_note.screenshot_alt')} hint={t('release_notes.admin.form.screenshot_alt_hint')} error={errors.screenshot_alt}>
              <Input maxLength={200} value={form.data.screenshot_alt} onChange={(e) => form.setData('screenshot_alt', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
              <Field label={t('activerecord.attributes.release_note.link_path')} hint={t('release_notes.admin.form.link_hint')} error={errors.link_path}>
                <Input value={form.data.link_path} placeholder="/help/…" onChange={(e) => form.setData('link_path', e.target.value)} />
              </Field>
              <Field label={t('activerecord.attributes.release_note.link_label')} error={errors.link_label}>
                <Input maxLength={60} value={form.data.link_label} placeholder={t('release_notes.admin.form.link_label_placeholder')} onChange={(e) => form.setData('link_label', e.target.value)} />
              </Field>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg bg-leaf-50 p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={form.data.published} onChange={(e) => form.setData('published', e.target.checked)} />
              <span>
                <span className="block font-semibold text-leaf-800">{t('release_notes.admin.form.published')}</span>
                <span className="block text-loam-600">{t('release_notes.admin.form.published_hint')}</span>
              </span>
            </label>
            <Button type="submit" disabled={form.processing}>{t('release_notes.admin.form.save')}</Button>
          </form>
        </Card>

        <section aria-label={t('release_notes.admin.form.preview')}>
          <p className="mb-2 font-hand text-xl text-loam-400">{t('release_notes.admin.form.preview')}</p>
          <NoteCard note={preview} onLikes={() => {}} preview />
        </section>
      </div>
    </div>
  )
}

/** A local URL for the picked file, revoked when it changes. */
function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setUrl(null); return }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}
