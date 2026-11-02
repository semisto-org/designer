import clsx from 'clsx'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { arrange, SHORT_SHARE, zoneOn, type Arrangement, type Claim, type Device, type Zone, type ZoneSpec } from '@/map/layout/zones'

/** Same breakpoint as the rail: a desktop column from md up, a phone below. */
export const DESKTOP_QUERY = '(min-width: 768px)'

/** The claims of every mounted card, and the arrangement they lead to. */
class ZoneStore {
  private claims = new Map<string, Claim>()
  private listeners = new Set<() => void>()
  private seq = 0
  private cached: Arrangement | null = null
  constructor(public device: Device) {}

  claim(id: string, zone: ZoneSpec, priority: number, active: boolean) {
    const previous = this.claims.get(id)
    if (previous && previous.priority === priority && previous.active === active && JSON.stringify(previous.zone) === JSON.stringify(zone)) return
    // A card that becomes active again joins the back of its queue.
    const seq = previous && previous.active === active ? previous.seq : ++this.seq
    this.claims.set(id, { id, zone, priority, active, seq })
    this.changed()
  }

  release(id: string) {
    if (this.claims.delete(id)) this.changed()
  }

  setDevice(device: Device) {
    if (device === this.device) return
    this.device = device
    this.changed()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  snapshot = (): Arrangement => {
    this.cached ??= arrange([...this.claims.values()], this.device)
    return this.cached
  }

  private changed() {
    this.cached = null
    this.listeners.forEach((listener) => listener())
  }
}

type Host = { store: ZoneStore; slots: Partial<Record<Zone, HTMLElement | null>>; device: Device }
const ZoneContext = createContext<Host | null>(null)

/** The current device, as the zones see it. */
export function useZoneDevice(): Device {
  return useContext(ZoneContext)?.device ?? 'desktop'
}

/** True while the zone shows at least one card. */
export function useZoneOccupied(zone: Zone): boolean {
  const host = useContext(ZoneContext)
  const arrangement = useSyncExternalStore(host?.store.subscribe ?? noop, host?.store.snapshot ?? empty, host?.store.snapshot ?? empty)
  return (arrangement.shown[zone]?.length ?? 0) > 0
}

const noop = () => () => {}
const EMPTY: Arrangement = { shown: {}, visible: new Set(), short: new Set() }
const empty = () => EMPTY

/**
 * The editor's floating cards, laid out once (see `zones.ts`): one layer over
 * the map with a slot per zone. Cards render into their slot with
 * <ZoneCard>; nothing over the map positions itself.
 */
export function ZoneLayer({ children }: { children: ReactNode }) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const device: Device = desktop ? 'desktop' : 'phone'
  const [store] = useState(() => new ZoneStore(device))
  useLayoutEffect(() => store.setDevice(device), [store, device])
  const arrangement = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const [slots, setSlots] = useState<Partial<Record<Zone, HTMLElement | null>>>({})
  const refs = useRef<Partial<Record<Zone, (element: HTMLElement | null) => void>>>({})
  const slot = (zone: Zone) => {
    refs.current[zone] ??= (element) => setSlots((current) => (current[zone] === element ? current : { ...current, [zone]: element }))
    return refs.current[zone]
  }
  const occupied = (zone: Zone) => (arrangement.shown[zone]?.length ?? 0) > 0
  const layer = useRef<HTMLDivElement>(null)
  useSideWidths(layer, slots.left ?? null, slots.right ?? null, slots.bottom ?? null)
  const host = useMemo(() => ({ store, slots, device }), [store, slots, device])

  return (
    <ZoneContext.Provider value={host}>
      <div ref={layer} data-zone-layer className="pointer-events-none absolute inset-0 z-20 flex">
        {desktop && <div ref={slot('left')} data-zone="left" className={clsx('order-1 flex min-h-0 flex-col p-2', !occupied('left') && 'hidden')} />}
        {desktop && <div
            ref={slot('right')}
            data-zone="right"
            className={clsx('order-3 flex min-h-0 flex-col p-2', !occupied('right') && 'hidden')}
            style={arrangement.short.has('right') ? { height: `${SHORT_SHARE * 100}%` } : undefined}
          />}
        {/* Last in the page so what unfolds from the middle (a picker, the time card) shows over the side cards. */}
        <div className="relative order-2 flex min-w-0 flex-1 flex-col">
          <div ref={slot('toolbar')} data-zone="toolbar" className="flex justify-center px-2 pt-2 md:pt-3.5" />
          {/* Clear of the map's zoom controls on the right (and centred from md up). */}
          <div ref={slot('top')} data-zone="top" className="flex flex-col items-stretch gap-2 pl-2 pr-14 pt-2 md:items-center md:px-14" />
          <div className="min-h-0 flex-1" />
          {/* Above the map's own line along the foot (scale, sources, weather); on a phone, above the tool bar too. */}
          <div
            ref={slot('bottom')}
            data-zone="bottom"
            className={clsx(
              'flex flex-wrap-reverse items-end gap-2 px-2 pb-[5.25rem] md:flex-nowrap md:pb-10 md:pl-4',
              !occupied('bottom') && 'hidden',
            )}
          />
          {!desktop && (
            <div ref={slot('sheet')} data-zone="sheet" className={clsx('absolute inset-x-2 bottom-14 top-0 flex flex-col justify-end', !occupied('sheet') && 'hidden')} />
          )}
        </div>
      </div>
      {children}
    </ZoneContext.Provider>
  )
}

/**
 * Publishes how much of the map the side cards take, for the map's own
 * controls (CSS on `.editor-map`), for `visiblePadding` and for the toast:
 * --zone-left / --zone-right on the map, --editor-toast-bottom /
 * --editor-toast-center on the page.
 */
function useSideWidths(layer: React.RefObject<HTMLDivElement | null>, left: HTMLElement | null, right: HTMLElement | null, bottom: HTMLElement | null) {
  useEffect(() => {
    const element = layer.current
    const map = element?.parentElement
    if (!element || !map || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const update = () => {
      const l = left?.offsetWidth ?? 0
      const r = right?.offsetWidth ?? 0
      map.style.setProperty('--zone-left', `${l}px`)
      map.style.setProperty('--zone-right', `${r}px`)
      const box = map.getBoundingClientRect()
      const foot = bottom && bottom.offsetHeight > 0 ? bottom.getBoundingClientRect().top : box.bottom - 40
      root.style.setProperty('--editor-toast-bottom', `${Math.max(16, Math.round(window.innerHeight - foot + 8))}px`)
      root.style.setProperty('--editor-toast-center', `${Math.round(box.left + l + (box.width - l - r) / 2)}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    ;[element, left, right, bottom].forEach((e) => e && observer.observe(e))
    return () => {
      observer.disconnect()
      root.style.removeProperty('--editor-toast-bottom')
      root.style.removeProperty('--editor-toast-center')
    }
  }, [layer, left, right, bottom])
}

type CardProps = {
  /** Unique among the editor's cards. */
  id: string
  zone: ZoneSpec
  /** Who wins a zone two cards want (PRIORITY in zones.ts). */
  priority?: number
  /** False: the card keeps its state but asks for no room (a closed discussion). */
  active?: boolean
  /** Place in a row zone (the bottom): lower first. */
  order?: number
  /** The card's box lets clicks through to the map (its children opt back in with pointer-events-auto). */
  passThrough?: boolean
  className?: string
  children: ReactNode
}

/**
 * A floating card of the editor, in its zone. It stays mounted while it
 * waits behind a more important card, only hidden.
 */
export function ZoneCard({ id, zone, priority = 0, active = true, order, passThrough = false, className, children }: CardProps) {
  const host = useContext(ZoneContext)
  const store = host?.store
  const key = typeof zone === 'string' ? zone : `${zone.desktop}|${zone.phone}`
  useLayoutEffect(() => {
    store?.claim(id, typeof zone === 'string' ? zone : { desktop: zone.desktop, phone: zone.phone }, priority, active)
  }, [store, id, key, priority, active]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => store?.release(id), [store, id])
  const arrangement = useSyncExternalStore(store?.subscribe ?? noop, store?.snapshot ?? empty, store?.snapshot ?? empty)
  if (!host) return null
  const target = host.slots[zoneOn(zone, host.device)]
  if (!target) return null
  const shown = arrangement.visible.has(id)
  return createPortal(
    <div data-zone-card={id} className={clsx('flex min-h-0 max-w-full flex-col', passThrough ? 'pointer-events-none' : 'pointer-events-auto', !shown && 'hidden', className)} style={order != null ? { order } : undefined}>
      {children}
    </div>,
    target,
  )
}
