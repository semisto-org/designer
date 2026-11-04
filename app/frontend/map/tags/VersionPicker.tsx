import { Layers2 } from 'lucide-react'
import { useEffect } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { setVersion, useDrawingState } from '@/map/drawing/store'
import { hasTag, tagCounts } from '@/map/tags/tags'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'

/**
 * « Version » over the map (top left): shows on the map only the elements of
 * one tag (« Version A », « Phase 1 »…) plus those without any tag, which
 * every version shares. The designer shows a client one proposal at a
 * time, and the printed plan follows. Only there when the map has tags.
 */
export default function VersionPicker() {
  const { features } = useEditor()
  const version = useDrawingState((s) => s.version)
  const tags = tagCounts(features)
  const current = version ? tags.find(({ tag }) => hasTag({ properties: { tags: [tag] } }, version))?.tag ?? null : null

  // A version whose tag is gone (renamed, removed) stops hiding anything.
  useEffect(() => {
    if (version && !current) setVersion(null)
  }, [version, current])

  if (tags.length === 0) return null
  return (
    // The left zone while no panel is open (the panel outranks it); on a phone, in the foot of the map (map/layout/zones).
    <ZoneCard id="version" zone={{ desktop: 'left', phone: 'bottom' }} priority={PRIORITY.version} order={0} className="items-start">
    <label
      title={t('tags.version_hint')}
      className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-2.5 pr-1 text-sm text-loam-600 shadow-[0_6px_16px_rgb(26_26_26/0.14)] focus-within:ring-2 focus-within:ring-prune-600 md:mt-1.5 md:ml-1"
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
    </ZoneCard>
  )
}
