import type { ReactNode } from 'react'
import type { BoardPhase } from '@/types/teamBoard'

/** A project's life drawn as a plant that grows: seed, sprout, sapling, planted, grove, fruit. */
const PHASE_ICONS: Record<BoardPhase, ReactNode> = {
  request: <><path d="M13 22c0-2 0-3 0-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><ellipse cx="13" cy="20.5" rx="4" ry="2.8" fill="currentColor" /></>,
  offer: <><path d="M13 23v-7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><path d="M13 17c-3.5 0-5.5-2.2-5.5-4.5 2.8 0 5.5 1.4 5.5 4.5zm0-1c0-3.2 2.3-5 5.5-5 0 2.8-2.3 5-5.5 5z" fill="currentColor" /></>,
  design: <><path d="M13 23V10" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" /><circle cx="13" cy="10" r="4.6" fill="currentColor" /><circle cx="9.5" cy="14" r="2.8" fill="currentColor" /><circle cx="16.5" cy="14" r="2.8" fill="currentColor" /></>,
  implementation: <><path d="M4 23h18" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" /><path d="M9 22v-6M18 22v-8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><circle cx="9" cy="13.5" r="3.6" fill="currentColor" /><circle cx="18" cy="10" r="4.8" fill="currentColor" /></>,
  co_management: <><path d="M7 23v-6M13 23V9M19 23v-6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><circle cx="13" cy="8" r="5.6" fill="currentColor" /><circle cx="7" cy="14" r="4" fill="currentColor" /><circle cx="19" cy="14" r="4" fill="currentColor" /></>,
  completed: <><path d="M13 24v-8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /><circle cx="13" cy="10" r="7" fill="currentColor" /><circle cx="10" cy="9" r="1.6" fill="#fffdf7" /><circle cx="15.5" cy="12" r="1.6" fill="#fffdf7" /><circle cx="14" cy="6.5" r="1.4" fill="#fffdf7" /></>,
}

export function PhaseIcon({ phase, className }: { phase: BoardPhase; className?: string }) {
  return <svg viewBox="0 0 26 26" aria-hidden="true" className={className ?? 'h-6 w-6'}>{PHASE_ICONS[phase]}</svg>
}

/** The commercial phases (before a yes) read in mango, the living ones in artichoke. */
export const phaseTone = (phase: BoardPhase) => (phase === 'request' || phase === 'offer' ? 'text-humus-600' : 'text-leaf-600')
