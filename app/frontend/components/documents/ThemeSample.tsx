import { t } from '@/lib/i18n'
import { themeStyle } from '@/lib/documentTheme'
import type { DocumentTheme } from '@/types/documentThemes'

/**
 * A page of an offer, in miniature, wearing a charter: what the client
 * will hold, so a colour or a font is judged on paper, not on a swatch.
 */
export function ThemeSample({ theme }: { theme: DocumentTheme }) {
  return (
    <div style={themeStyle(theme)} className="overflow-hidden rounded-2xl bg-white font-doc-body text-doc-text shadow-sm ring-1 ring-loam-900/10">
      {theme.coverUrl && <img src={theme.coverUrl} alt="" className="h-28 w-full object-cover" />}
      <div className="space-y-4 p-6">
        {theme.logoUrl && <img src={theme.logoUrl} alt="" className="max-h-10 max-w-[9rem] object-contain object-left" />}
        <div className="space-y-1">
          <p className="font-doc-heading text-3xl font-semibold leading-tight text-doc-heading">{t('document_themes.preview_title')}</p>
          <p className="text-sm">{t('document_themes.preview_lead')}</p>
        </div>
        <div className="space-y-1.5 border-t border-loam-100 pt-4">
          <p className="font-semibold text-doc-heading"><span className="font-doc-heading text-doc-accent">1 ·</span> {t('document_themes.preview_step')}</p>
          <p className="text-sm leading-relaxed">{t('document_themes.preview_text')}</p>
          <ul className="space-y-0.5 text-sm">
            {[t('document_themes.preview_bullet_1'), t('document_themes.preview_bullet_2')].map((item) => (
              <li key={item} className="flex gap-2"><span className="text-doc-accent" aria-hidden>●</span>{item}</li>
            ))}
          </ul>
        </div>
        {theme.footer && <p className="whitespace-pre-line border-t border-loam-100 pt-3 text-sm text-loam-500">{theme.footer}</p>}
      </div>
    </div>
  )
}
