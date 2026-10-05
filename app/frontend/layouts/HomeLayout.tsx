import type { ReactNode } from 'react'
import { Flash } from '@/components/ui/Flash'
import { MetaHead } from '@/components/MetaHead'
import { PublicFooter } from '@/components/site/PublicFooter'

/** The home page draws its own full-screen header over the time-lapse; it keeps the site's footer. */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MetaHead />
      <Flash />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  )
}
