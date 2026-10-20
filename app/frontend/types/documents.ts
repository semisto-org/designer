import type { FormResponseData } from '@/types/forms'

// The map's « Documents » library (Maps::DocumentsController, MapDocument#as_inertia).

export type DocumentKind = 'pdf' | 'image' | 'text' | 'sheet' | 'slides' | 'plan' | 'other'

export type MapDocumentData = {
  id: number
  title: string
  description: string | null
  tags: string[]
  /** « library »: added in Documents; « project_sheet »: sent with the project sheet; « form »: an answer to a team's form. */
  origin: 'library' | 'project_sheet' | 'form'
  kind: DocumentKind
  /** What the browser shows as is. */
  preview: 'image' | 'pdf' | null
  filename: string | null
  contentType: string | null
  byteSize: number | null
  /** A PDF over 5 Mo is compressed after upload; the lighter copy replaces it. */
  compression: 'pending' | 'compressed' | 'unchanged' | null
  /** The size as sent, when the compressed copy replaced it. */
  originalByteSize: number | null
  createdAt: string
  updatedAt: string
  uploadedBy: string | null
  /** Sent by the people behind the project, through the sheet's private link. */
  fromProjectLink: boolean
  /** The answer itself, for a document filed from a team's form. */
  form?: FormResponseData | null
  /** A Markdown file small enough to open as a page and edit in place. */
  markdown: boolean
  /** The first words of a Markdown page, for its tile (the map's library only). */
  excerpt?: string | null
  contentEditedAt: string | null
  contentEditedBy: string | null
  thumbUrl: string | null
  previewUrl: string | null
  fileUrl: string
  downloadUrl: string
}

export type DocumentLimits = { maxBytes: number }

/** The logo at the top of a map's documents (Map#letterhead): its team's, else its pro owner's. */
export type Letterhead = { logoUrl: string; name: string } | null
