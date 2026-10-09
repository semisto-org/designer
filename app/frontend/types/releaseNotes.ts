/** Someone who gave a thumbs up to a « Nouveautés » entry. */
export type ReleaseNoteLiker = { id: number; name: string; avatarUrl: string | null }

export type ReleaseNoteLikes = {
  likes: ReleaseNoteLiker[]
  likesCount: number
  liked: boolean
}

/** An entry of « Nouveautés » as the page shows it (ReleaseNote#as_inertia). */
export type ReleaseNoteEntry = ReleaseNoteLikes & {
  id: number
  title: string
  paragraphs: string[]
  /** YYYY-MM-DD: the day it shipped. */
  publishedOn: string
  link: { path: string; label: string | null } | null
  screenshot: { url: string; alt: string } | null
  /** Published since the person's previous visit. */
  fresh: boolean
}

/** Shared prop: the dot on « Nouveautés » and the note on « Mes cartes ». */
export type ReleaseNotesStatus = { unseen: number; latest: { id: number; title: string } | null }

/** The staff screen (ReleaseNote#as_admin_json). */
export type AdminReleaseNote = {
  id: number
  key: string | null
  title: string
  body: string
  publishedOn: string
  published: boolean
  publishedAt: string | null
  linkPath: string | null
  linkLabel: string | null
  screenshotAlt: string | null
  screenshotUrl: string | null
  likesCount: number
}
