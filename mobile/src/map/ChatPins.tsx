// The spots messages of the map's discussion are pinned to, on the
// terrain's map: a plum ring with a paper heart, as the website draws
// them (collab/chat/ChatPins.tsx). The one just shown from the discussion
// is larger. A tap opens the discussion on that message.
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { useMemo } from 'react'
import type { ChatMessage } from '@/lib/chat-core'
import { colors } from '@/ui/theme'

export function ChatPins({ messages, focusedId, onPress }: { messages: ChatMessage[]; focusedId: number | null; onPress: (messageId: number) => void }) {
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: messages.filter((m) => Array.isArray(m.location)).map((m) => ({
      type: 'Feature', id: m.id,
      geometry: { type: 'Point', coordinates: m.location! },
      properties: { message: m.id, focused: m.id === focusedId ? 1 : 0 },
    })),
  }), [messages, focusedId])
  if (data.features.length === 0) return null
  return (
    <GeoJSONSource id="chat-pins" data={data}
      onPress={(event) => {
        const id = Number(event.nativeEvent.features?.[0]?.properties?.message)
        if (!id) return
        event.stopPropagation()
        onPress(id)
      }}>
      <Layer id="chat-pins-ring" type="circle"
        paint={{
          'circle-color': colors.paper, 'circle-stroke-color': colors.prune600,
          'circle-radius': ['case', ['==', ['get', 'focused'], 1], 13, 9],
          'circle-stroke-width': ['case', ['==', ['get', 'focused'], 1], 4, 3],
        }} />
      <Layer id="chat-pins-dot" type="circle"
        paint={{ 'circle-color': colors.prune600, 'circle-radius': ['case', ['==', ['get', 'focused'], 1], 5, 3.5] }} />
    </GeoJSONSource>
  )
}
