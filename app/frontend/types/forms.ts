// A team's own forms (Tally) and their answers (Teams::FormsPayload,
// FormResponse#as_inertia).

export type FormAnswer = { label: string; value: string }

/** One answer, as filed in a map's documents. */
export type FormResponseData = {
  id: number
  formName: string
  submittedAt: string
  fields: FormAnswer[]
}

export type TeamFormResponse = FormResponseData & {
  mapId: number | null
  mapName: string | null
  /** What the hidden field said, when it named no map of the team. */
  mapReference: string | null
  documentId: number | null
}

export type TeamForm = { id: number; name: string; url: string; externalId: string; responsesCount: number }

export type TeamFormsPageProps = {
  team: { id: number; name: string; admin: boolean }
  /** Null until an admin connects Tally; the address and secret are for admins. */
  inbox: { connected: true; url?: string; secret?: string } | null
  forms: TeamForm[]
  responses: TeamFormResponse[]
  maps: { id: number; name: string }[]
  /** The hidden field that carries the map's id (« carte »). */
  mapField: string
}

/** A form to send from a map's « Formulaires », its link already filled for the map. */
export type MapFormLink = { id: number; name: string; url: string; link: string; responsesCount: number }

export type MapFormResponse = FormResponseData & { documentId: number | null }

export type MapFormsPageProps = {
  map: { id: number; name: string; role: string | null; teamId: number | null }
  team: { id: number; name: string; admin: boolean } | null
  /** Tally is connected for the team (an admin created the inbox). */
  connected: boolean
  canEdit: boolean
  /** Editors only: the forms to send. */
  forms: MapFormLink[]
  responses: MapFormResponse[]
}
