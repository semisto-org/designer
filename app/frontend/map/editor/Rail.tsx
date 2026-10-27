import clsx from 'clsx'
import { Check, ChevronUp, Ellipsis, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { STAGES, useGuide } from '@/map/editor/guide'
import { parseExpanded, railItems } from '@/map/editor/railItems'
import type { EditorPanel, PanelGroup } from '@/map/panels/registry'

const GROUPS: PanelGroup[] = [...STAGES, 'share']
const COLLAPSED_KEY = 'designer.editor.rail-collapsed'
const EXPANDED_KEY = 'designer.editor.rail-expanded'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** The rail's folded state, kept in this browser for every map. */
function useRailCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const update = useCallback((value: boolean) => {
    setCollapsed(value)
    try {
      window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
    } catch {
      /* private window: this visit only */
    }
  }, [])
  return [collapsed, update]
}

/** The steps the person unfolded beyond their essential tools, kept in this browser for every map. */
function useExpandedGroups(): [Set<string>, (group: string) => void] {
  const [expanded, setExpanded] = useState(() => {
    try {
      return new Set(parseExpanded(window.localStorage.getItem(EXPANDED_KEY)))
    } catch {
      return new Set<string>()
    }
  })
  const toggle = useCallback((group: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      try {
        window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      } catch {
        /* private window: this visit only */
      }
      return next
    })
  }, [])
  return [expanded, toggle]
}

type RailProps = { panels: EditorPanel[] }

/**
 * The rail's steps with the tools they list now: every tool of a step the
 * person unfolded, the essential ones elsewhere (see railItems).
 */
function useRailGroups(panels: EditorPanel[]) {
  const editor = useEditor()
  const guide = useGuide()
  const [expanded, toggle] = useExpandedGroups()
  const todoPanel = guide.target?.kind === 'item' ? guide.target.panel : null
  const groups = GROUPS.map((group) => {
    const all = panels.filter((p) => p.group === group && !p.hiddenFromRail).sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
    const { shown, hidden } = railItems(all, { expanded: expanded.has(group), pinned: [editor.activePanel, todoPanel] })
    const foldable = expanded.has(group) && all.some((p) => p.essential)
    return { group, items: shown, hidden, foldable }
  }).filter((g) => g.items.length > 0)
  return { groups, toggle, todoPanel }
}

/** Numbered circle of a step in the rail: filled for the step in focus, a check once done. */
function StepDot({ number, active, done }: { number: number; active: boolean; done: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-semibold',
        active || done ? 'bg-prune-600 text-white' : 'border border-[#9a9a9a] text-loam-500',
      )}
    >
      {done && !active ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : number}
    </span>
  )
}

/**
 * The tools of the editor, grouped by the four steps of the journey, with
 * their names (220 px), or as icons only (56 px). A desktop column beside the
 * map; on a phone, the same tools in a scrolling bar along the bottom.
 */
export function EditorRail({ panels }: RailProps) {
  const editor = useEditor()
  const guide = useGuide()
  const [collapsed, setCollapsed] = useRailCollapsed()
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const root = useRef<HTMLElement>(null)
  const { groups, toggle, todoPanel } = useRailGroups(panels)
  const doneSteps = new Set(guide.data?.steps.filter((s) => s.done).map((s) => s.key) ?? [])

  // A step picked in the header: bring its group into view.
  useEffect(() => {
    root.current?.querySelector(`[data-group="${editor.focusStage}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editor.focusStage])

  const showTip = (label: string, target: HTMLElement) => {
    if (!collapsed) return
    const rect = target.getBoundingClientRect()
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 8 })
  }

  return (
    <nav
      ref={root}
      aria-label={t('editor.panels_nav')}
      className={clsx(
        'flex h-full shrink-0 flex-col border-r border-loam-900/10 bg-loam-50 transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-[220px]',
      )}
    >
      <div className={clsx('flex min-h-0 flex-1 flex-col overflow-y-auto', collapsed ? 'items-center gap-1 py-3' : 'gap-3.5 px-2.5 py-3.5')}>
        {groups.map(({ group, items, hidden, foldable }) => {
          const index = STAGES.indexOf(group as never)
          const numbered = index >= 0
          const active = group === editor.focusStage
          const label = numbered ? t(`maps.stages.${group}`) : t('editor.rail.share')
          return (
            <section key={group} data-group={group} aria-label={label} className={clsx('flex flex-col', collapsed ? 'mt-2 items-center gap-1 first:mt-0' : 'gap-0.5')}>
              {collapsed ? (
                numbered
                  ? <StepDot number={index + 1} active={active} done={doneSteps.has(group as never)} />
                  : <span aria-hidden className="h-px w-6 bg-loam-900/10" />
              ) : (
                <h3
                  className={clsx(
                    'mb-1 flex items-center gap-2 px-2 font-sans text-[10.5px] font-semibold uppercase tracking-[0.12em]',
                    active ? 'text-prune-600' : 'text-loam-400',
                  )}
                >
                  {numbered && <StepDot number={index + 1} active={active} done={doneSteps.has(group as never)} />}
                  {label}
                </h3>
              )}
              {items.map((p) => {
                const open = editor.activePanel === p.id
                const todo = p.id === todoPanel
                const name = t(p.label)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={collapsed ? name : undefined}
                    aria-pressed={open}
                    onClick={() => editor.openPanel(open ? null : p.id)}
                    onMouseEnter={(e) => showTip(name, e.currentTarget)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={(e) => showTip(name, e.currentTarget)}
                    onBlur={() => setTip(null)}
                    className={clsx(
                      'relative flex items-center rounded-lg transition-colors active:scale-[0.98]',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
                      collapsed ? 'h-[30px] w-9 justify-center' : clsx('gap-2.5 px-2 text-left text-[13px]', active ? 'py-[7px]' : 'py-[5px]'),
                      open
                        ? clsx('bg-white font-semibold text-prune-600 shadow-[0_1px_3px_rgb(26_26_26/0.08)]', collapsed && 'h-[34px]')
                        : 'text-loam-600 hover:bg-loam-100 hover:text-loam-900',
                    )}
                  >
                    <p.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{name}</span>}
                    {todo && (
                      <span
                        className={clsx('rounded-full bg-humus-400', collapsed ? 'absolute right-0.5 top-0.5 h-1.5 w-1.5' : 'h-[7px] w-[7px] shrink-0')}
                        title={t('editor.rail.todo')}
                      >
                        <span className="sr-only">{t('editor.rail.todo')}</span>
                      </span>
                    )}
                  </button>
                )
              })}
              {(hidden > 0 || foldable) && (
                <MoreTools collapsed={collapsed} hidden={hidden} onToggle={() => { setTip(null); toggle(group) }} />
              )}
            </section>
          )
        })}
      </div>
      <div className={clsx('shrink-0 py-2', collapsed ? 'flex justify-center' : 'px-2.5')}>
        <button
          type="button"
          onClick={() => { setTip(null); setCollapsed(!collapsed) }}
          aria-label={collapsed ? t('editor.rail.expand') : undefined}
          title={collapsed ? t('editor.rail.expand') : undefined}
          className={clsx(
            'flex items-center gap-2 rounded-lg text-xs text-loam-400 transition-colors hover:bg-loam-100 hover:text-loam-900',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
            collapsed ? 'h-8 w-9 justify-center' : 'w-full px-2 py-1.5',
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <><PanelLeftClose className="h-[15px] w-[15px]" aria-hidden />{t('editor.rail.collapse')}</>}
        </button>
      </div>
      {tip && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-loam-900 px-2 py-1 text-xs font-medium text-white"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.label}
        </span>
      )}
    </nav>
  )
}

/** On a phone: the same tools, icons only, in a bar along the bottom of the map. */
export function EditorBar({ panels }: RailProps) {
  const editor = useEditor()
  const nav = useRef<HTMLElement>(null)
  const { groups, toggle, todoPanel } = useRailGroups(panels)

  // Keep the open panel's button in view in the scrolling bar.
  useEffect(() => {
    nav.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [editor.activePanel])

  return (
    <nav
      ref={nav}
      className="absolute inset-x-2 bottom-2 z-20 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-loam-200"
      aria-label={t('editor.panels_nav')}
    >
      {groups.map(({ group, items, hidden, foldable }, gi) => (
        <div key={group} className={clsx('flex shrink-0', gi > 0 && 'border-l border-loam-100 pl-1')}>
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              title={t(p.label)}
              aria-label={t(p.label)}
              aria-pressed={editor.activePanel === p.id}
              onClick={() => editor.openPanel(editor.activePanel === p.id ? null : p.id)}
              className={clsx(
                'relative grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                editor.activePanel === p.id ? 'bg-prune-600 text-white' : 'text-loam-600 hover:bg-loam-100',
              )}
            >
              <p.icon className="h-[18px] w-[18px]" />
              {p.id === todoPanel && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-humus-400" />}
            </button>
          ))}
          {(hidden > 0 || foldable) && (
            <IconButton
              size="sm"
              className="mt-0.5 rounded-lg"
              label={hidden > 0 ? t('editor.rail.more', { count: hidden }) : t('editor.rail.less')}
              onClick={() => toggle(group)}
            >
              {hidden > 0 ? <Ellipsis /> : <ChevronUp />}
            </IconButton>
          )}
        </div>
      ))}
    </nav>
  )
}

/**
 * « 6 autres outils »: unfolds the step's other tools; « Moins d'outils »
 * folds a step the person unfolded back to its essential ones.
 */
function MoreTools({ collapsed, hidden, onToggle }: { collapsed: boolean; hidden: number; onToggle: () => void }) {
  const label = hidden > 0 ? t('editor.rail.more', { count: hidden }) : t('editor.rail.less')
  if (collapsed) {
    return (
      <IconButton size="sm" className="rounded-lg" label={label} onClick={onToggle}>
        {hidden > 0 ? <Ellipsis /> : <ChevronUp />}
      </IconButton>
    )
  }
  return (
    <Button variant="ghost" size="sm" className="mt-0.5 self-start" onClick={onToggle}>
      {hidden > 0 ? <Ellipsis className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
      {label}
    </Button>
  )
}
