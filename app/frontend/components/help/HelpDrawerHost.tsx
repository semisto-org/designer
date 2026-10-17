import { useCallback, useEffect, useState } from 'react'
import { HelpDrawer } from '@/components/help/HelpDrawer'
import { OPEN_HELP } from '@/components/help/openHelp'

/** The help drawer opened from anywhere with openHelp(slug). Mounted once (ImpersonationFrame). */
export default function HelpDrawerHost() {
  const [state, setState] = useState<{ open: boolean; slug: string | null }>({ open: false, slug: null })
  useEffect(() => {
    const onOpen = (event: Event) => setState({ open: true, slug: (event as CustomEvent<{ slug: string | null }>).detail?.slug ?? null })
    window.addEventListener(OPEN_HELP, onOpen)
    return () => window.removeEventListener(OPEN_HELP, onOpen)
  }, [])
  const close = useCallback(() => setState((was) => ({ ...was, open: false })), [])
  return <HelpDrawer open={state.open} slug={state.slug} onClose={close} />
}
