import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, Circle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { STEP_ICONS, itemLabel } from '@/components/journey/JourneyParts'
import { Button } from '@/components/ui/Button'
import { calendar } from '@/components/site/timelapse/model.ts'
import { content, tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { resolvePanel } from '@/lib/journeyPanels'
import { useJourneyState } from '@/lib/journeyStore'
import { useEditor } from '@/map/editor/EditorContext'
import { PANELS } from '@/map/panels'
import type { MapStage } from '@/types'
import type { JourneyData, JourneyStep } from '@/types/journey'
import { TourScene, type TourMoment } from './TourScene'

type PageKey = 'intro' | MapStage | 'claude'
type Page = { key: PageKey; moment: TourMoment }

/** The pages of the carnet and the moment of the example terrain each one shows. */
const PAGES: Page[] = [
  { key: 'intro', moment: { tau: 0.05 } },
  { key: 'observe', moment: { tau: 0.32, observe: true } },
  { key: 'map', moment: { tau: 0.55 } },
  { key: 'design', moment: { tau: 0.86, plan: true } },
  { key: 'plant', moment: { tau: 5.62 } },
  { key: 'claude', moment: { tau: 30.47 } },
]

type Copy = { kicker: string; title: string; body: string; note?: string; why?: string; tools?: Record<string, string>; outline?: string[] }

/**
 * The « carnet de route »: the four steps of the design, told on the painted
 * terrain of the home page while time passes on it, each with the tools that
 * serve it and where this map stands. It ends on Claude, who gives the most
 * once the carnet is full.
 */
export default function TourDialog({ aiConnected, onClose }: { aiConnected: boolean; onClose: () => void }) {
  const editor = useEditor()
  const { data } = useJourneyState()
  const [index, setIndex] = useState(0)
  const [tau, setTau] = useState(PAGES[0].moment.tau)
  const card = useRef<HTMLDivElement>(null)
  const page = PAGES[index]
  const copy = content<Copy>(`tour.pages.${page.key}`)
  const last = index === PAGES.length - 1

  const go = useCallback((to: number) => setIndex(Math.max(0, Math.min(PAGES.length - 1, to))), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') go(index + 1)
      else if (event.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, onClose])

  // A new page is read from its top, and announced.
  useEffect(() => {
    card.current?.scrollTo({ top: 0 })
    card.current?.focus({ preventScroll: true })
  }, [index])

  const openPanel = (panel: string) => {
    const id = resolvePanel(panel, editor.canEdit, editor.isOwner)
    onClose()
    if (id) editor.openPanel(id)
  }

  const step = data?.steps.find((s) => s.key === page.key)
  const next = data?.next

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-loam-50" role="dialog" aria-modal="true" aria-label={t('tour.label')}>
      <TourScene moment={page.moment} onTime={setTau} />
      <Stamp tau={tau} />

      <div className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex items-center gap-2 md:right-6 md:top-5">
        {!last && (
          <button type="button" onClick={onClose} className="hidden rounded-full bg-loam-50/90 px-3.5 py-1.5 text-sm font-medium text-loam-600 ring-1 ring-loam-900/5 hover:text-prune-700 sm:block">
            {t('tour.skip')}
          </button>
        )}
        <button
          type="button" onClick={onClose} aria-label={t('tour.close')} title={t('tour.close')}
          className="grid h-9 w-9 place-items-center rounded-full bg-loam-50/90 text-loam-600 shadow-sm ring-1 ring-loam-900/5 hover:text-prune-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        className={clsx(
          'absolute z-10 flex flex-col',
          // Below the painting on a phone, in the left margin from md up (where Painter.camera leaves room).
          'inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] top-[calc(52px+42vh)] md:inset-x-auto md:bottom-6 md:left-8 md:top-6 md:w-[420px] md:justify-center',
        )}
      >
        <div
          ref={card} tabIndex={-1} aria-live="polite"
          className="flex min-h-0 flex-col overflow-y-auto rounded-md bg-loam-50/95 px-5 pb-4 pt-4 shadow-[0_1px_0_rgb(43_41_64/0.1),0_20px_40px_-26px_rgb(43_41_64/0.35)] outline-none ring-1 ring-loam-900/5 md:px-6 md:pt-5"
        >
          <p className="font-hand text-2xl leading-tight text-leaf-600">{copy.kicker}</p>
          <h2 className="mt-1 text-balance text-[1.6rem] font-medium leading-[1.08] text-prune-900 md:text-[2rem]">{copy.title}</h2>
          <p className="mt-2.5 text-pretty text-[15px] leading-relaxed text-loam-600">{copy.body}</p>

          {page.key === 'intro' && <Outline items={copy.outline ?? []} data={data} onPick={go} />}
          {copy.tools && <Tools tools={copy.tools} canEdit={editor.canEdit} isOwner={editor.isOwner} onOpen={openPanel} />}
          {step && <OnYourMap step={step} mapName={editor.map.name} />}
          {page.key === 'claude' && <ClaudePage copy={copy} data={data} aiConnected={aiConnected} onLeave={onClose} />}

          {copy.note && <p className="mt-3 font-hand text-[1.35rem] leading-tight text-prune-600">{copy.note}</p>}
        </div>

        <nav className="mt-2 flex shrink-0 items-center gap-2 rounded-full bg-loam-50/95 p-1.5 shadow-sm ring-1 ring-loam-900/5" aria-label={t('tour.label')}>
          <button
            type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t('tour.previous')} title={t('tour.previous')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-prune-700 hover:bg-prune-50 disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <ol className={clsx('flex flex-1 items-center justify-center gap-1.5', last && 'max-sm:hidden')}>
            {PAGES.map((p, i) => (
              <li key={p.key}>
                <button
                  type="button" onClick={() => go(i)} aria-current={i === index ? 'step' : undefined}
                  aria-label={t('tour.page_of', { index: i + 1, total: PAGES.length })}
                  className={clsx('block h-2 rounded-full transition-all', i === index ? 'w-6 bg-prune-600' : 'w-2 bg-loam-300 hover:bg-loam-400')}
                />
              </li>
            ))}
          </ol>
          {last ? (
            <StartButton next={next} canEdit={editor.canEdit} isOwner={editor.isOwner} onOpen={openPanel} onClose={onClose} />
          ) : (
            <Button size="sm" onClick={() => go(index + 1)}>{t('tour.next')}<ArrowRight className="h-4 w-4" aria-hidden /></Button>
          )}
        </nav>
      </div>
    </div>
  )
}

/** Month and year on the example terrain, like the home page. */
function Stamp({ tau }: { tau: number }) {
  const months = content<string[]>('site.home.story.months')
  const cal = calendar(tau)
  const stage = cal.stage === 'growing' ? tf('site.home.story.stamp.growing', { year: cal.gardenYear }) : tf(`site.home.story.stamp.${cal.stage}`)
  return (
    <div className="pointer-events-none absolute left-4 top-[calc(0.85rem+env(safe-area-inset-top))] z-10 grid md:bottom-6 md:left-auto md:right-8 md:top-auto md:text-right" aria-hidden="true">
      <span className="timelapse-halo font-serif text-[1.4rem] leading-none text-prune-900 tabular-nums md:text-4xl">{months[cal.month]} {cal.year}</span>
      <span className="timelapse-halo font-hand text-lg text-prune-600 md:text-2xl">{stage}</span>
      <span className="timelapse-halo mt-1 hidden text-xs text-loam-500 md:block">{t('tour.example')}</span>
    </div>
  )
}

/** The four steps (and Claude) as a table of contents, each with where this map stands. */
function Outline({ items, data, onPick }: { items: string[]; data: JourneyData | null; onPick: (index: number) => void }) {
  return (
    <ol className="mt-4 space-y-1">
      {items.map((label, i) => {
        const step = data?.steps[i]
        const Icon = step ? STEP_ICONS[step.key] : null
        return (
          <li key={label}>
            <button type="button" onClick={() => onPick(i + 1)} className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left hover:bg-prune-50/60">
              <span className={clsx(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                step?.done ? 'bg-leaf-500 text-white' : step?.current ? 'bg-prune-600 text-white' : step ? 'bg-loam-100 text-loam-600' : 'bg-humus-100 text-humus-800',
              )}
              >
                {step?.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : step ? i + 1 : '✦'}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-loam-800 group-hover:text-prune-700">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-loam-400" aria-hidden />}
                {label}
              </span>
              {step?.current && <span className="font-hand text-lg leading-none text-prune-600">{t('journey.panel.current').toLowerCase()}</span>}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** The editor panels that serve this step, with the same icons as the rail on the left of the map. */
function Tools({ tools, canEdit, isOwner, onOpen }: { tools: Record<string, string>; canEdit: boolean; isOwner: boolean; onOpen: (panel: string) => void }) {
  const rows = Object.entries(tools).flatMap(([id, why]) => {
    const panel = PANELS.find((p) => p.id === id)
    return panel ? [{ panel, why, openable: resolvePanel(id, canEdit, isOwner) != null }] : []
  })
  if (rows.length === 0) return null
  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-loam-400">{t('tour.tools_title')}</p>
      <ul className="mt-1.5 space-y-0.5">
        {rows.map(({ panel, why, openable }) => (
          <li key={panel.id}>
            <button
              type="button" disabled={!openable} onClick={() => onOpen(panel.id)}
              className="group flex w-full items-start gap-3 rounded-lg px-1.5 py-1.5 text-left enabled:hover:bg-prune-50/60 disabled:cursor-default"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-loam-600 ring-1 ring-loam-200 group-enabled:group-hover:bg-prune-600 group-enabled:group-hover:text-white group-enabled:group-hover:ring-prune-600">
                <panel.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-loam-800">{t(panel.label)}</span>
                <span className="block text-xs leading-snug text-loam-500">{why}</span>
              </span>
              {openable && <span className="mt-1 hidden text-xs font-medium text-prune-700 group-hover:inline">{t('tour.tool_open')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Where this map stands in the step: its checklist, as the journey computes it. */
function OnYourMap({ step, mapName }: { step: JourneyStep; mapName: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-loam-300 px-3 py-2.5">
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate font-hand text-xl leading-none text-prune-600">{tf('tour.on_your_map', { map: mapName })}</span>
        <span className="shrink-0 text-xs font-medium text-loam-500">
          {step.done ? t('journey.panel.step_done') : t('journey.panel.step_count', { done: step.completed, total: step.total })}
        </span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {step.items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            {item.done
              ? <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-leaf-500 text-white"><Check className="h-2.5 w-2.5" aria-hidden /></span>
              : <Circle className="h-4 w-4 shrink-0 text-loam-300" aria-hidden />}
            <span className={item.done ? 'text-loam-500 line-through decoration-loam-300' : 'text-loam-700'}>{itemLabel(item.key)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What Claude would know of this place today, read from the journey's checklists. */
export function claudeKnowledge(data: JourneyData | null) {
  const items = new Map((data?.steps ?? []).flatMap((s) => s.items).map((i) => [i.key, i]))
  const project = items.get('project_sheet')
  const existing = items.get('existing')
  const rows: { key: string; done: boolean; vars: Record<string, number> }[] = [
    { key: 'region', done: true, vars: {} },
    { key: 'boundary', done: items.get('boundary')?.done ?? false, vars: {} },
    { key: 'project_sheet', done: project?.done ?? false, vars: { percent: project?.progress ?? 0 } },
    { key: 'existing', done: existing?.done ?? false, vars: { count: existing?.count ?? 0 } },
    ...(items.has('palette') ? [{ key: 'palette', done: items.get('palette')!.done, vars: {} }] : []),
  ]
  const share = rows.filter((r) => r.done).length / rows.length
  const verdict = share < 0.5 ? 'low' : share < 1 ? 'mid' : 'high'
  return { rows, share, verdict }
}

function ClaudePage({ copy, data, aiConnected, onLeave }: { copy: Copy; data: JourneyData | null; aiConnected: boolean; onLeave: () => void }) {
  const { rows, share, verdict } = claudeKnowledge(data)
  return (
    <>
      <p className="mt-2.5 text-pretty text-[15px] leading-relaxed text-loam-600">{copy.why}</p>
      <div className="mt-4 rounded-lg border border-dashed border-loam-300 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-loam-400">{t('tour.pages.claude.gauge_title')}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-loam-200" role="img" aria-label={`${Math.round(share * 100)} %`}>
          <div className="h-full rounded-full bg-leaf-500 transition-[width] duration-700" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-2 text-sm">
              {row.done
                ? <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-leaf-500 text-white"><Check className="h-2.5 w-2.5" aria-hidden /></span>
                : <Circle className="h-4 w-4 shrink-0 text-loam-300" aria-hidden />}
              <span className={row.done ? 'text-loam-700' : 'text-loam-500'}>{tf(`tour.pages.claude.gauge.${row.key}`, row.vars)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-hand text-[1.35rem] leading-tight text-prune-600">{tf(`tour.pages.claude.verdict.${verdict}`)}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {aiConnected ? (
          <p className="flex items-center gap-2 text-sm font-medium text-leaf-700">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-leaf-500 text-white"><Check className="h-3 w-3" aria-hidden /></span>
            {t('tour.pages.claude.connected')}
          </p>
        ) : (
          <Link href="/account/ai" onClick={onLeave} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-prune-700 ring-[1.5px] ring-inset ring-prune-600 hover:bg-prune-600 hover:text-white">
            {t('tour.pages.claude.connect')}
          </Link>
        )}
        <a href="/help/connecter-claude" target="_blank" rel="noreferrer" className="text-sm font-medium text-prune-700 underline decoration-prune-300 underline-offset-2 hover:decoration-prune-700">
          {t('tour.pages.claude.how')}
        </a>
      </div>
      <p className="mt-2 text-xs text-loam-500">{tf('tour.pages.claude.plans')}</p>
    </>
  )
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** The last page closes the carnet on the map's next action, as « Parcours » computes it. */
function StartButton({ next, canEdit, isOwner, onOpen, onClose }: {
  next: JourneyData['next'] | undefined; canEdit: boolean; isOwner: boolean; onOpen: (panel: string) => void; onClose: () => void
}) {
  if (next?.type === 'item' && resolvePanel(next.panel, canEdit, isOwner)) {
    return (
      <Button size="sm" onClick={() => onOpen(next.panel)} className="ml-auto min-w-0">
        <span className="truncate">{t('tour.start', { item: lowerFirst(itemLabel(next.item)) })}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
      </Button>
    )
  }
  return <Button size="sm" onClick={onClose}>{t('tour.start_plain')}<ArrowRight className="h-4 w-4" aria-hidden /></Button>
}
