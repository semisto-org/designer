/**
 * The fixed places of the map editor's floating cards (UX review, « Rendre
 * la carte à la personne »). Every card says which zone it belongs to; the
 * zone decides, here and nowhere else, how many cards it shows at once and
 * which one waits. A card that waits stays mounted (its draft, scroll and
 * search survive) and comes back as soon as the zone is free.
 *
 *   desktop (md and up)                       phone
 *   ┌──────┬──────── toolbar ───────┬───────┐  ┌──────── toolbar ────────┐
 *   │      │   top: messages (2)    │       │  │   top: messages (1)     │
 *   │ left │                        │ right │  │                         │
 *   │panel │        the map         │ sheet │  │        the map          │
 *   │ (1)  │                        │  (1)  │  │ bottom: time, legend…   │
 *   │      │ bottom: guide·time·leg.│       │  │ sheet (1), hides bottom │
 *   └──────┴── scale · weather ─────┴───────┘  └──────── tool bar ───────┘
 *
 * With both side cards open, the sheet stops at SHORT_SHARE of the height,
 * so the middle and the lower right of the map stay free. « À faire
 * maintenant » leaves the foot for a pill in the rail while a panel is open
 * (map/editor/GuidePill). The map's own controls (zoom, scale, sources,
 * weather) keep the corners and move beside an open side card (ZoneLayer).
 */

export type Device = 'desktop' | 'phone'
export type Zone = 'toolbar' | 'top' | 'left' | 'right' | 'bottom' | 'sheet'

/** A zone for both devices, or one per device. */
export type ZoneSpec = Zone | { desktop: Zone; phone: Zone }

export type ZoneRule = {
  /** Cards shown at once; the others wait, most important first. */
  keep: number
  /** Hidden altogether while this other zone shows a card. */
  hiddenBy?: Zone
  /** Shorter (SHORT_SHARE of the height) while this other zone shows a card. */
  shortWith?: Zone
}

/**
 * The share of the map's height a short zone keeps: with a panel on the left
 * and an element's sheet on the right, the sheet stops there (and scrolls),
 * so the two margins never both run the whole height of the map.
 */
export const SHORT_SHARE = 0.6

export const ZONE_RULES: Record<Device, Partial<Record<Zone, ZoneRule>>> = {
  desktop: {
    toolbar: { keep: Infinity },
    // Messages stack under the toolbar: what is being done now, then what an AI proposes.
    top: { keep: 2 },
    // One card per side: the open panel, the element sheet.
    left: { keep: 1 },
    right: { keep: 1, shortWith: 'left' },
    // A row along the foot: guide card, time strip, legend.
    bottom: { keep: Infinity },
  },
  phone: {
    toolbar: { keep: Infinity },
    top: { keep: 1 },
    bottom: { keep: Infinity, hiddenBy: 'sheet' },
    // One sheet at a time above the tool bar.
    sheet: { keep: 1 },
  },
}

/**
 * Who wins a zone that two cards want. Higher first; equal priorities keep
 * the order the cards arrived in.
 */
export const PRIORITY = {
  // top: an action in progress first, then the AI's proposals, then notices.
  activeTool: 40,
  aiProposals: 30,
  notice: 20,
  guide: 10,
  // left / right / sheet
  identify: 40,
  plantPeek: 35,
  inspector: 30,
  chat: 20,
  panel: 15,
  version: 5,
  // bottom row and toolbar: everything shows, `order` places it.
  always: 0,
} as const

export function zoneOn(spec: ZoneSpec, device: Device): Zone {
  return typeof spec === 'string' ? spec : spec[device]
}

export type Claim = { id: string; zone: ZoneSpec; priority: number; active: boolean; seq: number }

export type Arrangement = {
  /** The cards each zone shows, in their order of importance. */
  shown: Partial<Record<Zone, string[]>>
  /** Ids shown, for a quick lookup. */
  visible: Set<string>
  /** Zones that keep only SHORT_SHARE of the height right now. */
  short: Set<Zone>
}

/** Which cards show, given everything that claims a zone right now. */
export function arrange(claims: Claim[], device: Device): Arrangement {
  const rules = ZONE_RULES[device]
  const byZone = new Map<Zone, Claim[]>()
  for (const claim of claims) {
    if (!claim.active) continue
    const zone = zoneOn(claim.zone, device)
    if (!rules[zone]) continue
    byZone.set(zone, [...(byZone.get(zone) ?? []), claim])
  }
  const shown: Partial<Record<Zone, string[]>> = {}
  for (const [zone, list] of byZone) {
    const keep = rules[zone]?.keep ?? 0
    shown[zone] = [...list].sort((a, b) => b.priority - a.priority || a.seq - b.seq).slice(0, keep).map((c) => c.id)
  }
  for (const zone of Object.keys(shown) as Zone[]) {
    const by = rules[zone]?.hiddenBy
    if (by && shown[by]?.length) shown[zone] = []
  }
  const short = new Set<Zone>()
  for (const zone of Object.keys(shown) as Zone[]) {
    const other = rules[zone]?.shortWith
    if (other && shown[zone]?.length && shown[other]?.length) short.add(zone)
  }
  return { shown, visible: new Set(Object.values(shown).flat()), short }
}
