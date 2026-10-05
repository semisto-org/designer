// Signed in or not, for the whole app. Also finishes a sign-in that comes
// back through the redirect link (magic link opened in another browser).
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { createContext, useContext, useEffect, useState } from 'react'
import { completeSignIn, loadTokens, onAuthChange } from '@/lib/auth'
import { authorizeMapRequests } from '@/lib/maps'

type Status = 'loading' | 'signed_in' | 'signed_out'
const SessionContext = createContext<Status>('loading')

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    loadTokens().then((tokens) => setStatus(tokens ? 'signed_in' : 'signed_out'))
    const off = onAuthChange((signedIn) => {
      setStatus(signedIn ? 'signed_in' : 'signed_out')
      void authorizeMapRequests()
    })
    // The magic link opened in Safari ends on the redirect link, which opens
    // the app (running or not); the sign-in sheet left open is closed.
    const finish = (url: string | null) => {
      if (!url?.startsWith('org.semisto.designer://oauth')) return
      void completeSignIn(url).then((result) => { if (result === 'signed_in') WebBrowser.dismissAuthSession() })
    }
    void Linking.getInitialURL().then(finish)
    const sub = Linking.addEventListener('url', ({ url }) => finish(url))
    return () => { off(); sub.remove() }
  }, [])

  useEffect(() => { if (status === 'signed_in') void authorizeMapRequests() }, [status])

  return <SessionContext.Provider value={status}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
