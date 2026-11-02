import clsx from 'clsx'
import { Footprints } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { useGuide } from '@/map/editor/guide'
import { actionFor, GuideCardBody } from '@/map/panels/JourneyOverlay'

/**
 * « À faire maintenant » while a panel is open on a computer: the card leaves
 * the map (its foot would sit beside the panel) and waits here, at the top of
 * the rail, as a pill with the next action. A click opens the whole card
 * beside the rail; it closes on Escape, a click elsewhere or its next action.
 */
export function GuidePill({ collapsed }: { collapsed: boolean }) {
  const editor = useEditor()
  const guide = useGuide()
  const anchor = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  // Another panel, another moment: the card folds back into the pill.
  useEffect(() => setAt(null), [editor.activePanel])
  useEffect(() => {
    if (!at) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null)
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!card.current?.contains(target) && !anchor.current?.contains(target)) setAt(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [at])

  if (!editor.canEdit || !guide.data || !guide.target) return null
  const action = actionFor(guide.target, guide.focus, editor.map.stage, editor.canEdit)
  const label = t('editor.guide.collapsed', { action: action ?? t(`editor.guide.step_title.${guide.focus}`) })
  const toggle = () => {
    if (at) return setAt(null)
    const rect = anchor.current?.getBoundingClientRect()
    if (rect) setAt({ top: rect.top, left: rect.right + 8 })
  }

  return (
    <div ref={anchor} className={clsx('shrink-0', collapsed ? 'flex justify-center pt-3' : 'px-2.5 pt-3.5')}>
      {collapsed ? (
        <IconButton size="sm" label={label} pressed={at != null} aria-expanded={at != null} onClick={toggle} className="relative text-prune-700">
          <Footprints />
          <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-humus-400" />
        </IconButton>
      ) : (
        <Button variant="secondary" size="sm" title={t('editor.guide.title')} aria-expanded={at != null} onClick={toggle} className="w-full !justify-start">
          <Footprints className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-humus-400" />
        </Button>
      )}
      {at && (
        <div
          ref={card}
          role="dialog"
          aria-label={t('editor.guide.title')}
          className="fixed z-40 w-[300px] overflow-y-auto rounded-2xl"
          style={{ top: at.top, left: at.left, maxHeight: `calc(100dvh - ${Math.round(at.top)}px - 1rem)` }}
        >
          <GuideCardBody collapsed={false} setCollapsed={(value) => value && setAt(null)} onAction={() => setAt(null)} />
        </div>
      )}
    </div>
  )
}
