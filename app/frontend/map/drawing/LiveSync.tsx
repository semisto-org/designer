import { usePage } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import { cable } from '@/lib/cable'
import { t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import type { SharedProps } from '@/types'
import type { FeatureBroadcast } from '@/types/drawing'

/**
 * Real-time co-editing: applies the feature changes other people make on
 * this map (MapFeaturesChannel). A change is applied only when it is newer
 * than the local copy (lock_version), so our own echoes are ignored.
 */
export default function LiveSync() {
  const editor = useEditor()
  const userId = usePage<SharedProps>().props.currentUser?.id ?? null
  const latest = useRef({ editor, userId })
  latest.current = { editor, userId }
  const mapId = editor.map.id

  useEffect(() => {
    const subscription = cable().subscriptions.create(
      { channel: 'MapFeaturesChannel', map_id: mapId },
      { received: (message: FeatureBroadcast) => apply(latest.current.editor, message, latest.current.userId) },
    )
    return () => {
      subscription.unsubscribe()
    }
  }, [mapId])

  return null
}

function apply(editor: Editor, message: FeatureBroadcast, userId: number | null) {
  const current = editor.features.find((f) => f.properties.id === message.id)
  if (message.action === 'upsert') {
    if (current && current.properties.lockVersion >= message.feature.properties.lockVersion) return
    editor.upsertFeatures([message.feature])
    if (current && editor.selectedId === message.id) editor.notify(t('drawing.live.changed_selected'))
  } else if (current) {
    editor.removeFeatures([message.id])
    // Our own deletion can echo back before its response: no « someone else » then.
    if (editor.selectedId === message.id && message.actorId !== userId) editor.notify(t('drawing.live.removed_selected'))
  }
}
