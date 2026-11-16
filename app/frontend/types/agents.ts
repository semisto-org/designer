/** « Collègue IA »: the AI member of a team (TeamAgent) and her page (Teams::AgentPayload). */
export type TeamAgent = { id: number; name: string; instructions: string | null; active: boolean }

export type AgentRunRow = {
  id: number
  status: 'queued' | 'running' | 'done' | 'limit' | 'budget' | 'failed'
  kind: 'mention' | 'task'
  mapId: number
  mapName: string
  requestedBy: string
  toolCalls: number
  tools: string[]
  /** Cents of a US dollar, with decimals. */
  costCents: number
  createdAt: string
  finishedAt: string | null
}

export type AgentPageProps = {
  team: { id: number; name: string; admin: boolean }
  agent: TeamAgent | null
  /** The module is granted, she exists, is not paused and the team gave a key. */
  ready: boolean
  hasKey: boolean
  maps: { id: number; name: string; address: string | null; enabled: boolean }[]
  usage: { spentCents: number; budgetCents: number; requests: number }
  runs: AgentRunRow[]
  /** Admins only. The key itself never comes back, only its hint. */
  settings?: { keyHint: string | null; provider: string; model: string } | null
  limits: { name: number; instructions: number; budgetMaxCents: number }
}
