import { Head, Link, router, useForm, usePage } from '@inertiajs/react'
import { ArrowLeft, ImagePlus, Palette, RotateCcw, Sparkles } from 'lucide-react'
import { useRef } from 'react'
import { LogoCard } from '@/components/LogoCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { ThemeSample } from '@/components/documents/ThemeSample'
import { t } from '@/lib/i18n'
import type { DocumentTheme, DocumentThemePageProps, ThemeField, ThemeFont } from '@/types/documentThemes'

const COLORS = ['heading_color', 'accent_color', 'text_color'] as const
const FONTS = ['heading_font', 'body_font'] as const

/**
 * « Charte graphique »: the colours, fonts, cover image and footer the
 * documents of a pro account or a team wear (DocumentTheme), around its
 * logo, with a live sample of a page. Semisto's charter fills whatever is
 * left empty. The AI can propose one from a design system (MCP
 * propose_document_theme): it waits on top, to take or refuse.
 */
export default function DocumentThemePage({ holder, theme, own, defaults, fonts, draft, canEdit }: DocumentThemePageProps) {
  const form = useForm<Record<ThemeField, string>>({
    heading_color: own.heading_color ?? defaults.heading_color ?? '',
    accent_color: own.accent_color ?? defaults.accent_color ?? '',
    text_color: own.text_color ?? defaults.text_color ?? '',
    heading_font: own.heading_font ?? defaults.heading_font ?? '',
    body_font: own.body_font ?? defaults.body_font ?? '',
    footer: own.footer ?? '',
  })
  const familyOf = (key: string) => fonts.find((font) => font.key === key)?.family ?? ''
  const live: DocumentTheme = {
    ...theme,
    headingColor: form.data.heading_color, accentColor: form.data.accent_color, textColor: form.data.text_color,
    headingFont: form.data.heading_font, bodyFont: form.data.body_font,
    headingFamily: familyOf(form.data.heading_font), bodyFamily: familyOf(form.data.body_font),
    footer: form.data.footer || null,
  }
  const submit = () => {
    form.transform((data) => ({ theme: data }))
    form.patch(holder.endpoint, { preserveScroll: true })
  }
  const reset = () => form.setData({ ...form.data, ...Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, value ?? ''])) })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Head title={t('document_themes.title')} />
      <Link href={holder.back} className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-900">
        <ArrowLeft className="h-4 w-4" aria-hidden />{holder.name}
      </Link>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-3xl"><Palette className="h-6 w-6 text-leaf-600" aria-hidden />{t('document_themes.title')}</h1>
        <p className="max-w-2xl text-loam-600">{t(holder.kind === 'team' ? 'document_themes.intro_team' : 'document_themes.intro_account')}</p>
        {canEdit ? <p className="max-w-2xl text-sm text-loam-500">{t('document_themes.ai_hint')}</p> : <p className="text-sm text-humus-800">{t('document_themes.read_only')}</p>}
      </header>

      {draft && <Draft draft={draft} endpoint={holder.endpoint} canEdit={canEdit} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
          <LogoCard logoUrl={holder.logoUrl} endpoint={holder.logoEndpoint} param={holder.logoParam} intro={t(holder.kind === 'team' ? 'logos.team_intro' : 'logos.account_intro')} canEdit={canEdit} />

          <Card className="space-y-5">
            <section className="space-y-3">
              <h2 className="text-base">{t('document_themes.colors')}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {COLORS.map((field) => (
                  <ColorField key={field} field={field} value={form.data[field]} disabled={!canEdit} onChange={(value) => form.setData(field, value)} />
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-base">{t('document_themes.fonts')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {FONTS.map((field) => (
                  <FontField key={field} field={field} fonts={fonts} value={form.data[field]} disabled={!canEdit} onChange={(value) => form.setData(field, value)} />
                ))}
              </div>
              <p className="text-sm text-loam-500">{t('document_themes.fonts_hint')}</p>
            </section>

            <Field label={t('document_themes.footer')} hint={t('document_themes.footer_hint')}>
              <Textarea rows={3} maxLength={600} value={form.data.footer} disabled={!canEdit} placeholder={t('document_themes.footer_placeholder')}
                onChange={(event) => form.setData('footer', event.target.value)} />
            </Field>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={form.processing || !form.isDirty} onClick={submit}>{t('document_themes.save')}</Button>
                <Button variant="ghost" size="sm" disabled={form.processing} onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('document_themes.reset')}
                </Button>
              </div>
            )}
          </Card>

          <CoverCard coverUrl={theme.coverUrl} endpoint={holder.endpoint} canEdit={canEdit} />
        </div>

        <aside className="space-y-2 lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-medium text-loam-600">{t('document_themes.preview')}</p>
          <ThemeSample theme={{ ...live, logoUrl: holder.logoUrl }} />
        </aside>
      </div>
    </div>
  )
}

function ColorField({ field, value, disabled, onChange }: { field: (typeof COLORS)[number]; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={t(`document_themes.${field}`)} hint={field === 'accent_color' ? t('document_themes.accent_hint') : undefined}>
      <span className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t(`document_themes.${field}`)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-loam-200 bg-white p-1 disabled:cursor-not-allowed"
          // design-lint-ok: a native colour input only takes #rrggbb, so a half-typed value shows black.
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input value={value} disabled={disabled} maxLength={7} className="font-mono" onChange={(event) => onChange(event.target.value.trim())} />
      </span>
    </Field>
  )
}

function FontField({ field, fonts, value, disabled, onChange }: { field: (typeof FONTS)[number]; fonts: ThemeFont[]; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const family = fonts.find((font) => font.key === value)?.family
  return (
    <Field label={t(`document_themes.${field}`)}>
      <Select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {(['serif', 'sans'] as const).map((kind) => (
          <optgroup key={kind} label={t(`document_themes.kinds.${kind}`)}>
            {fonts.filter((font) => font.kind === kind).map((font) => <option key={font.key} value={font.key}>{font.docx}</option>)}
          </optgroup>
        ))}
      </Select>
      <span className="block truncate text-xl text-loam-800" style={{ fontFamily: family ? `"${family}"` : undefined }}>Jardin-forêt · 1 2 3</span>
    </Field>
  )
}

function CoverCard({ coverUrl, endpoint, canEdit }: { coverUrl: string | null; endpoint: string; canEdit: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const error = (usePage().props.errors as unknown as Record<string, string> | undefined)?.cover
  const send = (theme: Record<string, string | File>) =>
    router.post(endpoint, { _method: 'patch', theme: { ...currentFields(), ...theme } }, { forceFormData: true, preserveScroll: true })
  // The cover rides on the same form as the rest: resend the saved fields with it.
  const props = usePage().props as unknown as DocumentThemePageProps
  const currentFields = () => Object.fromEntries(Object.entries(props.own).filter((entry): entry is [string, string] => entry[1] != null))

  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-base"><ImagePlus className="h-4 w-4 text-leaf-500" aria-hidden />{t('document_themes.cover')}</h2>
      <p className="text-sm text-loam-600">{t('document_themes.cover_hint')}</p>
      {coverUrl
        ? <img src={coverUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />
        : <p className="rounded-xl border border-dashed border-loam-300 px-5 py-4 text-sm text-loam-500">{t('document_themes.cover_none')}</p>}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>{coverUrl ? t('document_themes.cover_change') : t('document_themes.cover_choose')}</Button>
          {coverUrl && <Button variant="ghost" size="sm" onClick={() => send({ remove_cover: 'true' })}>{t('document_themes.cover_remove')}</Button>}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) send({ cover: file })
            }} />
        </div>
      )}
      {error && <p className="text-sm text-clay-700">{error}</p>}
    </Card>
  )
}

function Draft({ draft, endpoint, canEdit }: { draft: NonNullable<DocumentThemePageProps['draft']>; endpoint: string; canEdit: boolean }) {
  const fields = Object.keys(draft.fields ?? {}).map((field) => t(`document_themes.fields.${field}`)).join(', ')
  return (
    <section className="grid gap-4 rounded-2xl bg-humus-50 p-4 ring-1 ring-inset ring-humus-200 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 font-medium text-humus-900">
          <Sparkles className="h-4 w-4" aria-hidden />
          {draft.clientName ? t('document_themes.draft.title', { client: draft.clientName }) : t('document_themes.draft.title_ai')}
        </p>
        {fields && <p className="text-sm text-loam-700">{t('document_themes.draft.changes', { fields })}</p>}
        {draft.rationale && <p className="whitespace-pre-line text-sm text-loam-600">{draft.rationale}</p>}
        {canEdit && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => router.post(`${endpoint}/accept_draft`, {}, { preserveScroll: true })}>{t('document_themes.draft.accept')}</Button>
            <Button size="sm" variant="ghost" onClick={() => router.delete(`${endpoint}/reject_draft`, { preserveScroll: true })}>{t('document_themes.draft.reject')}</Button>
          </div>
        )}
      </div>
      <ThemeSample theme={draft.theme} />
    </section>
  )
}
