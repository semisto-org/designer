// Super admin screens (Admin::DashboardController, Admin::UsersController).
export type PlanKey = 'free' | 'yearly' | 'atelier' | 'bureau'

export type AdminUserRow = {
  id: number
  name: string
  email: string
  avatarUrl: string | null
  admin: boolean
  google: boolean
  createdAt: string
  lastSignedInAt: string | null
  mapsCount: number
  plan: PlanKey
}

export type AdminMapRow = {
  id: number
  name: string
  createdAt: string
  areaM2: number | null
  archived: boolean
  region: string | null
  owner: { id: number; name: string; email: string }
}

export type AdminEventAction = 'impersonation_started' | 'impersonation_ended' | 'admin_granted' | 'admin_revoked'

export type AdminEventRow = {
  id: number
  action: AdminEventAction
  createdAt: string
  ipAddress: string | null
  admin: { id: number | null; name: string | null }
  target: { id: number | null; name: string } | null
  reason: 'stopped' | 'expired' | 'sign_out' | null
}

export type AdminStats = {
  users: { total: number; new7d: number; new30d: number; active30d: number; admins: number; inTeams: number }
  maps: { total: number; new30d: number; archived: number; published: number; teams: number; areaHa: number }
  activity: { features: number; features30d: number; aiDrafts: number; aiActions30d: number; aiUsers30d: number; comments30d: number }
  plans: { billingEnabled: boolean; paying: number; byPlan: Partial<Record<PlanKey, number>> }
  revenue: { year: number; last30d: number; total: number; count: number }
  inbox: { serviceRequests: number; invoiceRequests: number }
  signupsByWeek: { week: string; count: number }[]
  mapsByRegion: { region: string; count: number }[]
}

export type ImpersonationData = {
  userName: string
  userEmail: string
  adminName: string
  endsAt: string
}

export type AdminMapCounts = {
  palette: number
  plants: number
  patches: number
  features: number
  drafts: number
  editors: number
  viewers: number
  comments: number
  photos: number
  planImages: number
  aiActions: number
}

// Admin::MapStats: one map of the « Cartes » screen.
export type AdminMapStatsRow = {
  id: number
  name: string
  stage: 'observe' | 'map' | 'design' | 'plant'
  region: string | null
  team: string | null
  areaM2: number | null
  archived: boolean
  published: boolean
  createdAt: string
  lastActivityAt: string | null
  owner: { id: number; name: string; email: string; plan: PlanKey }
  counts: AdminMapCounts
}
