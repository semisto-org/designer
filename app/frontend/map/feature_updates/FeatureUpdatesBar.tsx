import clsx from 'clsx'
import { Check, ChevronDown, ChevronUp, Crosshair, PencilLine, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import ChangeList from '@/map/feature_updates/ChangeList'
import { updatesOfBatch, type FeatureUpdateBatch } from '@/map/feature_updates/diff'
import { focusFeature } from '@/map/feature_updates/focus'
import { acceptBatch, loadFeatureUpdates, rejectBatch, rejectUpdate, acceptUpdate, useFeatureUpdates } from '@/map/feature_updates/store'

const POLL_MS = 30_000
const DESKTOP = '(min-width: 768px)'

/**
 * Card shown when an AI proposed changes to elements already on the map:
 * « Claude propose de modifier 96 éléments ». One block per proposal (one
 * call of the AI), with what changes and why, and « Tout accepter » /
 * « Tout refuser » for the whole proposal; its elements can be opened one by
 * one. Nothing changes on the map before a person accepts.
 */
export default function FeatureUpdatesBar() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { updates, batches } = useFeatureUpdates()
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery(DESKTOP)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const sync = () => loadFeatureUpdates(mapId).catch(() => { /* offline or signed out: keep what is on screen */ })
    void sync()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sync()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [mapId])

  if (updates.length === 0) return null

  const authors = [...new Set(batches.map((b) => b.clientName).filter(Boolean))]
  const author = authors.length === 1 ? authors[0]! : t('feature_updates.default_author')
  const inspectorOpen = editor.selected != null
  // On a phone the inspector is a bottom sheet: fold the card while it is up.
  const expanded = open && (isDesktop || !inspectorOpen)

  return (
    <section
      ref={sectionRef}
      aria-label={t('feature_updates.region')}
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
          <PencilLine className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-loam-900">
            {t('feature_updates.title', { count: updates.length, author })}
          </span>
          {!expanded && (
            <span className="block truncate text-sm text-loam-500">{t(editor.canEdit ? 'feature_updates.cta' : 'feature_updates.viewer_hint')}</span>
          )}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-loam-400" /> : <ChevronDown className="h-4 w-4 text-loam-400" />}
      </button>
      {expanded && (
        <div className="max-h-[45vh] divide-y divide-humus-100 overflow-y-auto border-t border-humus-100 md:max-h-[60vh]">
          {batches.map((batch) => (
            <BatchBlock key={batch.batch} batch={batch} card={sectionRef} isDesktop={isDesktop} />
          ))}
        </div>
      )}
    </section>
  )
}

function BatchBlock({ batch, card, isDesktop }: { batch: FeatureUpdateBatch; card: React.RefObject<HTMLElement | null>; isDesktop: boolean }) {
  const editor = useEditor()
  const { updates } = useFeatureUpdates()
  const items = useMemo(() => updatesOfBatch(updates, batch.batch), [updates, batch.batch])
  const [showItems, setShowItems] = useState(false)
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const ids = items.map((u) => u.id)
  // What the proposal changes, read on its first element: a batch by filter changes the same fields everywhere.
  const sample = items[0]
  const sameEverywhere = items.every((u) => JSON.stringify(u.proposedChanges) === JSON.stringify(sample?.proposedChanges))

  async function run(key: number | 'all', action: () => Promise<string | void>) {
    setBusy(key)
    try {
      const message = await action()
      if (message) editor.notify(message)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (!sample) return null

  return (
    <div className="space-y-2 px-3 py-3">
      <div>
        <p className="text-sm font-semibold text-loam-900">{batch.summary || t('feature_updates.no_summary')}</p>
        <p className="text-sm text-loam-500">{t('feature_updates.batch_count', { count: items.length })}</p>
      </div>
      {sameEverywhere && (
        <div className="rounded-lg bg-humus-50/70 px-3 py-2">
          <ChangeList changes={sample.changes} compact hideBefore={items.length > 1} />
        </div>
      )}
      <p className="whitespace-pre-line text-sm text-loam-700">
        <span className="font-medium">{t('feature_updates.rationale')} : </span>
        {sample.rationale}
      </p>
      <button
        type="button"
        onClick={() => setShowItems(!showItems)}
        aria-expanded={showItems}
        className="inline-flex items-center gap-1 text-sm font-medium text-prune-600 hover:text-prune-800"
      >
        {showItems ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {t(showItems ? 'feature_updates.hide_items' : 'feature_updates.show_items')}
      </button>
      {showItems && (
        <ul className="divide-y divide-loam-100 rounded-lg ring-1 ring-loam-100">
          {items.map((update) => {
            const feature = editor.features.find((f) => f.properties.id === update.featureId)
            const label = feature?.properties.name || (feature ? t(`editor.kinds.${feature.properties.kind}`) : `#${update.featureId}`)
            return (
              <li key={update.id} className={clsx('px-2 py-1.5', editor.selectedId === update.featureId && 'bg-prune-50')}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => feature && focusFeature(editor, feature, card.current, isDesktop)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm text-loam-800 hover:bg-loam-50"
                    title={t('feature_updates.focus')}
                  >
                    <Crosshair className="h-3.5 w-3.5 shrink-0 text-loam-400" />
                    <span className="truncate">{label}</span>
                  </button>
                  {editor.canEdit && (
                    <>
                      <button
                        type="button"
                        aria-label={`${t('feature_updates.accept')} « ${label} »`}
                        title={t('feature_updates.accept')}
                        disabled={busy !== null}
                        onClick={() => run(update.id, () => acceptUpdate(editor, update.id))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-leaf-600 hover:bg-leaf-50 disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${t('feature_updates.reject')} « ${label} »`}
                        title={t('feature_updates.reject')}
                        disabled={busy !== null}
                        onClick={() => run(update.id, () => rejectUpdate(editor, update.id))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-clay-500 hover:bg-clay-50 disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
                {!sameEverywhere && <div className="pb-1 pl-7"><ChangeList changes={update.changes} compact /></div>}
              </li>
            )
          })}
        </ul>
      )}
      {editor.canEdit && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-clay-500"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm(t('feature_updates.confirm_reject_all', { count: ids.length }))) return
              void run('all', async () => t('feature_updates.rejected_all', { count: await rejectBatch(editor, batch.batch, ids) }))
            }}
          >
            {t('feature_updates.reject_all', { count: ids.length })}
          </Button>
          <Button
            size="sm"
            variant="leaf"
            disabled={busy !== null}
            onClick={() => run('all', async () => {
              const { accepted, failed } = await acceptBatch(editor, batch.batch, ids)
              if (failed.length) editor.notify(t('feature_updates.failed', { count: failed.length, message: failed[0].message }), 'error')
              return t('feature_updates.accepted_all', { count: accepted })
            })}
          >
            <Check className="h-4 w-4" />
            {t('feature_updates.accept_all', { count: ids.length })}
          </Button>
        </div>
      )}
    </div>
  )
}
