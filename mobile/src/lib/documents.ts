// A file joined to a message on the website, opened from the phone. The
// server answers the app with a short-lived link (JSON) rather than a
// redirect, and the system browser opens it: it shows a PDF or an image,
// and offers to save or share anything else.
import * as WebBrowser from 'expo-web-browser'
import { api } from './api'
import { documentPath } from './chat-core'

export async function openDocument(mapId: number, documentId: number): Promise<void> {
  const { url } = await api<{ url: string }>('GET', documentPath(mapId, documentId, 'original'))
  await WebBrowser.openBrowserAsync(url)
}
