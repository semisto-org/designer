// The free fonts a « charte graphique » can choose (DocumentTheme::FONTS),
// loaded where a themed document is shown: each @font-face only downloads
// its files when a page actually uses the family. Inter and EB Garamond
// come with the app (entrypoints/application.css).
import '@fontsource-variable/cormorant-garamond/wght.css'
import '@fontsource-variable/lora/wght.css'
import '@fontsource-variable/fraunces/wght.css'
import '@fontsource-variable/source-serif-4/wght.css'
import '@fontsource-variable/merriweather/wght.css'
import '@fontsource-variable/playfair-display/wght.css'
import '@fontsource-variable/work-sans/wght.css'
import '@fontsource-variable/dm-sans/wght.css'
import '@fontsource-variable/nunito-sans/wght.css'
import '@fontsource-variable/open-sans/wght.css'
import '@fontsource-variable/montserrat/wght.css'
import '@fontsource-variable/raleway/wght.css'
import type { CSSProperties } from 'react'
import type { DocumentTheme } from '@/types/documentThemes'

const SERIF_FALLBACK = 'Georgia, serif'
const SANS_FALLBACK = 'ui-sans-serif, system-ui, sans-serif'

/**
 * The CSS variables a themed document reads (the doc-* tokens of
 * application.css: text-doc-heading, font-doc-body…). Without a theme they
 * fall back to Semisto's tokens.
 */
export function themeStyle(theme: DocumentTheme | null | undefined): CSSProperties | undefined {
  if (!theme) return undefined
  return {
    '--doc-heading': theme.headingColor,
    '--doc-accent': theme.accentColor,
    '--doc-text': theme.textColor,
    '--doc-heading-font': `"${theme.headingFamily}", ${SERIF_FALLBACK}`,
    '--doc-body-font': `"${theme.bodyFamily}", ${SANS_FALLBACK}`,
  } as CSSProperties
}

/** The typography plugin's colours on the charter's (Prose `colors`). */
export const THEMED_PROSE_COLORS =
  '[--tw-prose-body:var(--color-doc-text)] [--tw-prose-headings:var(--color-doc-heading)] [--tw-prose-bold:var(--color-doc-text)] ' +
  '[--tw-prose-links:var(--color-doc-accent)] [--tw-prose-bullets:var(--color-doc-accent)] [--tw-prose-counters:var(--color-doc-accent)] ' +
  '[--tw-prose-hr:var(--color-loam-200)] [--tw-prose-quotes:var(--color-doc-text)] [--tw-prose-quote-borders:var(--color-doc-accent)] ' +
  '[--tw-prose-th-borders:var(--color-loam-200)] [--tw-prose-td-borders:var(--color-loam-200)]'
