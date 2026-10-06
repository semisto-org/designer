import type { MapFeature } from '@/types'

/** Access an AI client is granted: read the maps, or read and post drafts. */
export type AiAccessLevel = 'read' | 'drafts'

/**
 * The 14-day trial of AI drafts on the free plan (AiTrial). `endsAt` is the
 * date it would end if it started now while still `available`. Null when
 * it does not matter (paid plan, billing off).
 */
export type AiTrialData = {
  state: 'available' | 'active' | 'ended'
  days: number
  endsAt: string
  daysLeft: number | null
} | null

export const formatTrialDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long' }).format(new Date(iso))

export type ApiTokenData = {
  id: number
  name: string
  hint: string
  access: AiAccessLevel
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export type AuthorizedAppData = {
  id: number
  name: string
  access: AiAccessLevel
  authorizedAt: string
  lastUsedAt: string | null
}

export type DraftsResponse = {
  drafts: MapFeature[]
  author: string | null
  summary: string | null
}

export type AiActionData = {
  id: number
  tool: string
  status: 'ok' | 'error'
  arguments: Record<string, unknown>
  result: Record<string, unknown>
  errorMessage: string | null
  clientName: string | null
  credentialType: 'oauth' | 'token' | null
  userName: string
  createdAt: string
  /** For proposals: current status of the drafts it created. */
  outcome?: Partial<Record<'draft' | 'active' | 'rejected' | 'withdrawn', number>>
}

export type McpToolParameter = {
  name: string
  type: string
  required: boolean
  description: string
  enum?: string[]
  default?: unknown
  constraints?: Partial<Record<'minimum' | 'maximum' | 'minLength' | 'maxLength' | 'minItems' | 'maxItems' | 'maxProperties' | 'pattern', number | string>>
}

export type McpToolDoc = {
  name: string
  title: string
  description: string
  requirement: 'read' | 'propose' | 'withdraw'
  readOnly: boolean
  parameters: McpToolParameter[]
}

export type McpEndpoints = {
  mcp: string
  authorizationServerMetadata: string
  protectedResourceMetadata: string
  register: string
  authorize: string
  token: string
  revoke: string
  docs: string
  account: string
}
