/** A « charte graphique » as the pages read it (DocumentTheme#as_json). */
export type DocumentTheme = {
  headingColor: string
  accentColor: string
  textColor: string
  headingFont: string
  bodyFont: string
  headingFamily: string
  bodyFamily: string
  footer: string | null
  logoUrl: string | null
  coverUrl: string | null
  name: string | null
}

export type ThemeField = 'heading_color' | 'accent_color' | 'text_color' | 'heading_font' | 'body_font' | 'footer'
export type ThemeFields = Partial<Record<ThemeField, string | null>>

export type ThemeFont = { key: string; family: string; docx: string; kind: 'serif' | 'sans' }

export type DocumentThemePageProps = {
  holder: { kind: 'account' | 'team'; name: string; logoUrl: string | null; logoEndpoint: string; logoParam: 'user' | 'team'; endpoint: string; back: string }
  theme: DocumentTheme
  own: ThemeFields
  defaults: Record<ThemeField, string | null>
  fonts: ThemeFont[]
  draft: { theme: DocumentTheme; fields: ThemeFields; rationale: string | null; clientName: string | null; proposedAt: string } | null
  canEdit: boolean
}
