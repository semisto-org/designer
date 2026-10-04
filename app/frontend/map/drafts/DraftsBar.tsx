import { bbox as turfBbox } from '@turf/turf'
import { Check, ChevronDown, ChevronUp, Crosshair, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { acceptDraft, acceptDrafts, rejectDraft, rejectDrafts } from '@/map/drafts/actions'
import { LAYER_COLORS } from '@/map/layers/features'
import type { DraftsResponse } from '@/types/mcp'
import type { FeatureLayer, MapFeature } from '@/types'

const POLL_MS = 30_000
const DESKTOP = '(min-width: 768px)'
// Room the inspector takes on the right of the map on desktop (w-80 + margins).
const INSPECTOR_PX = 352
const LAYERS: FeatureLayer[] = ['existing', 'water', 'access', 'structures', 'plants', 'animals', 'networks', 'notes']

/**
 * Overlay shown when an AI proposed drafts on the map: « Claude propose
 * 12 éléments ». Lists them by layer; each one can be focused, accepted or
 * rejected, or all at once. New drafts posted through the MCP while the
 * editor is open show up within half a minute.
 */
export default function DraftsBar() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery(DESKTOP)
  const sectionRef = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [meta, setMeta] = useState<{ author: string | null; summary: string | null }>({ author: null, summary: null })
  const mapId = editor.map.id
  // The editor object changes with every feature; polling reads the latest.
  const editorRef = useRef(editor)
  editorRef.current = editor

  const drafts = useMemo(
    () => editor.features.filter((f) => f.properties.status === 'draft').sort((a, b) => a.properties.id - b.properties.id),
    [editor.features],
  )
  const draftIds = useMemo(() => drafts.map((f) => f.properties.id), [drafts])
  const knownIds = useRef<number[]>(draftIds)
  knownIds.current = draftIds

  // Server truth: author and summary of the latest proposal, new drafts,
  // drafts reviewed or withdrawn elsewhere.
  const sync = useCallback(async () => {
    try {
      const data = await api<DraftsResponse>(`/maps/${mapId}/drafts`)
      setMeta({ author: data.author, summary: data.summary })
      const serverIds = new Set(data.drafts.map((f) => f.properties.id))
      const local = knownIds.current
      if (local.some((id) => !serverIds.has(id))) {
        await editorRef.current.reloadFeatures()
      } else if (data.drafts.some((f) => !local.includes(f.properties.id))) {
        editorRef.current.upsertFeatures(data.drafts)
      }
    } catch {
      // Offline or signed out: keep what is on screen.
    }
  }, [mapId])

  useEffect(() => {
    void sync()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sync()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [sync])

  const groups = useMemo(
    () => LAYERS.map((layer) => ({ layer, items: drafts.filter((f) => f.properties.layer === layer) })).filter((g) => g.items.length > 0),
    [drafts],
  )

  if (drafts.length === 0) return null

  const author = meta.author || t('drafts.default_author')
  const title = t('drafts.title', { count: drafts.length, author })

  // Frame the element in the part of the map left visible by the open list
  // (desktop) or by the inspector bottom sheet (mobile, where the list folds).
  function focus(feature: MapFeature) {
    editor.select(feature.properties.id)
    const map = editor.instance
    const box = map.getContainer().getBoundingClientRect()
    const padding = { top: 72, bottom: 72, left: 72, right: 72 }
    if (isDesktop) {
      padding.right = INSPECTOR_PX + 24
      const list = sectionRef.current?.getBoundingClientRect()
      if (list) padding.left = Math.max(padding.left, list.right - box.left + 24)
      const spare = box.width - padding.left - padding.right
      if (spare < 160) padding.left = Math.max(24, padding.left - (160 - spare))
    } else {
      padding.top = 96
      padding.bottom = Math.round(box.height * 0.6) + 16
    }
    const [minX, minY, maxX, maxY] = turfBbox(feature)
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding, maxZoom: 19, duration: 600 })
  }

  async function run<T>(key: number | 'all', action: () => Promise<T>, done?: (value: T) => string) {
    setBusy(key)
    try {
      const value = await action()
      if (done) editor.notify(done(value))
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const panelOpen = editor.activePanel != null
  const inspectorOpen = editor.selected != null
  // On a phone the inspector is a bottom sheet: fold the list while it is up.
  const expanded = open && (isDesktop || !inspectorOpen)

  return (
    <div
      className={clsx(
        'pointer-events-none absolute top-14 z-20 flex justify-center md:justify-start',
        // Under the drawing toolbar, clear of the tool rail (left, from md up) and the zoom controls (right).
        'left-2 right-12',
        panelOpen ? 'md:left-[23.5rem]' : 'md:left-14',
        inspectorOpen ? 'md:right-[21.5rem]' : 'md:right-14',
      )}
    >
      <section
        ref={sectionRef}
        aria-label={t('drafts.region')}
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-humus-200"
      >
        <button
          type="button"
          onClick={() => {
            if (!expanded && !isDesktop && inspectorOpen) editor.select(null)
            setOpen(!expanded)
          }}
          aria-expanded={expanded}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-humus-50"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-humus-100 text-humus-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-loam-900">{title}</span>
            {!expanded && <span className="block truncate text-xs text-loam-500">{t(editor.canEdit ? 'drafts.cta' : 'drafts.viewer_hint')}</span>}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-loam-400" /> : <ChevronDown className="h-4 w-4 text-loam-400" />}
        </button>
        {expanded && (
          <div className="border-t border-humus-100">
            {meta.summary && (
              <p className="whitespace-pre-line bg-humus-50/60 px-3 py-2 text-xs text-loam-700">{meta.summary}</p>
            )}
            <div className="max-h-[38vh] overflow-y-auto px-3 py-2 md:max-h-[55vh]">
              {groups.map(({ layer, items }) => (
                <div key={layer} className="py-1">
                  <h3 className="flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wide text-loam-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[layer] }} />
                    {t(`editor.layers.${layer}`)} · {items.length}
                  </h3>
                  <ul className="divide-y divide-loam-100">
                    {items.map((f) => {
                      const id = f.properties.id
                      const label = f.properties.name || t(`editor.kinds.${f.properties.kind}`)
                      return (
                        <li key={id} className={clsx('flex items-center gap-1 py-1', editor.selectedId === id && 'bg-prune-50')}>
                          <button
                            type="button"
                            onClick={() => focus(f)}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm text-loam-800 hover:bg-loam-50"
                            title={t('drafts.focus')}
                          >
                            <Crosshair className="h-3.5 w-3.5 shrink-0 text-loam-400" />
                            <span className="truncate">{label}</span>
                          </button>
                          {editor.canEdit && (
                            <>
                              <IconAction
                                label={t('drafts.accept_one', { name: label })}
                                tone="leaf"
                                disabled={busy !== null}
                                onClick={() => run(id, () => acceptDraft(editor, id))}
                              >
                                <Check className="h-4 w-4" />
                              </IconAction>
                              <IconAction
                                label={t('drafts.reject_one', { name: label })}
                                tone="clay"
                                disabled={busy !== null}
                                onClick={() => run(id, () => rejectDraft(editor, id))}
                              >
                                <X className="h-4 w-4" />
                              </IconAction>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
            {editor.canEdit ? (
              <div className="flex items-center justify-end gap-2 border-t border-loam-100 bg-loam-50 px-3 py-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-clay-500"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(t('drafts.confirm_reject_all', { count: draftIds.length }))) return
                    void run('all', () => rejectDrafts(editor, draftIds), (n) => t('drafts.rejected_all', { count: n }))
                  }}
                >
                  {t('drafts.reject_all')}
                </Button>
                <Button
                  size="sm"
                  variant="leaf"
                  disabled={busy !== null}
                  onClick={() => run('all', () => acceptDrafts(editor, draftIds), (n) => t('drafts.accepted_all', { count: n }))}
                >
                  <Check className="h-4 w-4" />
                  {t('drafts.accept_all')}
                </Button>
              </div>
            ) : (
              <p className="border-t border-loam-100 bg-loam-50 px-3 py-2 text-xs text-loam-500">{t('drafts.viewer_hint')}</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function IconAction({ label, tone, disabled, onClick, children }: {
  label: string; tone: 'leaf' | 'clay'; disabled: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg disabled:opacity-40',
        tone === 'leaf' ? 'text-leaf-600 hover:bg-leaf-50' : 'text-clay-500 hover:bg-clay-50',
      )}
    >
      {children}
    </button>
  )
}
