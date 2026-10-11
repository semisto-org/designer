// The map's « Documents » library (Maps::DocumentsController, MapDocument#as_inertia).

export type DocumentKind = 'pdf' | 'image' | 'text' | 'sheet' | 'slides' | 'plan' | 'other'

export type MapDocumentData = {
  id: number
  title: string
  description: string | null
  tags: string[]
  /** « library »: added in Documents; « project_sheet »: sent with the project sheet. */
  origin: 'library' | 'project_sheet'
  kind: DocumentKind
  /** What the browser shows as is. */
  preview: 'image' | 'pdf' | null
  filename: string | null
  contentType: string | null
  byteSize: number | null
  createdAt: string
  updatedAt: string
  uploadedBy: string | null
  /** Sent by the people behind the project, through the sheet's private link. */
  fromProjectLink: boolean
  thumbUrl: string | null
  previewUrl: string | null
  fileUrl: string
  downloadUrl: string
}

export type DocumentLimits = { maxBytes: number; extensions: string[] }
