import { Layers2 } from 'lucide-react'
import { useEffect } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { setVersion, useDrawingState } from '@/map/drawing/store'
import { hasTag, tagCounts } from '@/map/tags/tags'

/**
 * « Version » over the map (top left): shows on the map only the elements of
 * one tag (« Version A », « Phase 1 »…) plus those without any tag, which
 * every version shares. The designer shows a client one proposal at a
 * time, and the printed plan follows. Only there when the map has tags.
 */
export default function VersionPicker() {
  const { features, activePanel } = useEditor()
  const version = useDrawingState((s) => s.version)
  const tags = tagCounts(features)
  const current = version ? tags.find(({ tag }) => hasTag({ properties: { tags: [tag] } }, version))?.tag ?? null : null

  // A version whose tag is gone (renamed, removed) stops hiding anything.
  useEffect(() => {
    if (version && !current) setVersion(null)
  }, [version, current])

  if (tags.length === 0) return null
  return (
    // Phone: above the time strip and the legend. Larger screens: top left, where a side
    // panel opens, so it steps aside while one is open.
    <label
      title={t('tags.version_hint')}
      className={`pointer-events-auto absolute bottom-[14.75rem] left-2 z-10 items-center gap-1.5 rounded-full bg-white py-1 pl-2.5 pr-1 text-sm text-loam-600 shadow-[0_6px_16px_rgb(26_26_26/0.14)] focus-within:ring-2 focus-within:ring-prune-600 md:bottom-auto md:left-3 md:top-3.5 ${activePanel ? 'hidden' : 'inline-flex'}`}
    >
      <Layers2 className="h-4 w-4 shrink-0" aria-hidden />
      <select
        value={current ?? ''}
        onChange={(e) => setVersion(e.target.value || null)}
        aria-label={t('tags.version')}
        className={`max-w-[9rem] truncate rounded-full border-0 py-1 pl-2.5 pr-7 text-sm focus:ring-0 ${current ? 'bg-prune-600 text-white' : 'bg-loam-50 text-loam-900'}`}
      >
        <option value="">{t('tags.version_all')}</option>
        {tags.map(({ tag }) => <option key={tag} value={tag}>{tag}</option>)}
      </select>
    </label>
  )
}
