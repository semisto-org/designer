import type { EcoScreen } from './eco'
// Super admin screens (Admin::DashboardController, Admin::UsersController).
export type PlanKey = 'free' | 'yearly' | 'atelier' | 'bureau'

export type AdminUserRow = {
  id: number
  name: string
  email: string
  avatarUrl: string | null
  admin: boolean
  /** Reviews the species people propose to the plant catalogue. */
  catalogueReviewer: boolean
  google: boolean
  createdAt: string
  lastSignedInAt: string | null
  mapsCount: number
  plan: PlanKey
  /** Chose « Compte pro » on the welcome page. */
  professional: boolean
  /** The plan Semisto gave this account (Billing::PlanGift), while it runs. */
  gift: { id: number; planKey: Exclude<PlanKey, 'free'>; endsAt: string } | null
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

export type AdminEventAction = 'impersonation_started' | 'impersonation_ended' | 'admin_granted' | 'admin_revoked' | 'reviewer_granted' | 'reviewer_revoked'
  | 'promotion_code_created' | 'promotion_code_deactivated' | 'plan_gifted' | 'plans_gifted' | 'plan_gift_revoked'

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
  // Bytes on disk, variants included; documents include the soil lab reports.
  storageBytes: { photos: number; documents: number }
}

// Admin::Tech: the « Tech » screen.
export type AdminTech = {
  version: {
    commit: string | null
    commitUrl: string | null
    branch: string | null
    bootedAt: string | null
    environment: string
    ruby: string
    rails: string
  }
  storage: {
    defaultService: string
    services: { name: string; files: number; bytes: number }[]
    backup: {
      configured: boolean
      lastRun: {
        at: string
        copied: number
        alreadyThere: number
        missing: number
        failed: number
        erased: number
        awaitingErasure: number
      } | null
      awaitingErasure: number
    }
  }
  jobs:
    | { available: false }
    | {
        available: true
        ready: number
        scheduled: number
        running: number
        failedCount: number
        failed: { id: number; job: string | null; failedAt: string; error: string }[]
        processes: { kind: string; lastHeartbeatAt: string | null }[]
        recurring: { key: string; schedule: string; lastRunAt: string | null }[]
      }
  services: { key: string; configured: boolean }[]
  sobriety: { screens: EcoScreen[]; configured: boolean }
}
