// Signed in or not, for the whole app. Also finishes a sign-in that comes
// back through the redirect link (magic link opened in another browser).
import * as Linking from 'expo-linking'
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
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('org.semisto.designer://oauth')) void completeSignIn(url)
    })
    return () => { off(); sub.remove() }
  }, [])

  useEffect(() => { if (status === 'signed_in') void authorizeMapRequests() }, [status])

  return <SessionContext.Provider value={status}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
