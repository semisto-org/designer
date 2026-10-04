import { createConsumer, type Consumer } from '@rails/actioncable'
import { useEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import type { FeatureBroadcast } from '@/types/drawing'

let consumer: Consumer | null = null

/**
 * Real-time co-editing: applies the feature changes other people make on
 * this map (MapFeaturesChannel). A change is applied only when it is newer
 * than the local copy (lock_version), so our own echoes are ignored.
 */
export default function LiveSync() {
  const editor = useEditor()
  const latest = useRef<Editor>(editor)
  latest.current = editor
  const mapId = editor.map.id

  useEffect(() => {
    consumer ??= createConsumer()
    const subscription = consumer.subscriptions.create(
      { channel: 'MapFeaturesChannel', map_id: mapId },
      { received: (message: FeatureBroadcast) => apply(latest.current, message) },
    )
    return () => {
      subscription.unsubscribe()
    }
  }, [mapId])

  return null
}

function apply(editor: Editor, message: FeatureBroadcast) {
  const current = editor.features.find((f) => f.properties.id === message.id)
  if (message.action === 'upsert') {
    if (current && current.properties.lockVersion >= message.feature.properties.lockVersion) return
    editor.upsertFeatures([message.feature])
    if (current && editor.selectedId === message.id) editor.notify(t('drawing.live.changed_selected'))
  } else if (current) {
    editor.removeFeatures([message.id])
    if (editor.selectedId === message.id) editor.notify(t('drawing.live.removed_selected'))
  }
}
