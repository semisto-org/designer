import { usePage } from '@inertiajs/react'
import { useEffect, useState } from 'react'
import type { FlashData } from '@/types'

export function Flash() {
  const { flash } = usePage() as unknown as { flash: FlashData }
  const [visible, setVisible] = useState<FlashData>({})
  useEffect(() => {
    setVisible(flash ?? {})
    if (flash?.notice) {
      const timer = setTimeout(() => setVisible((v) => ({ ...v, notice: undefined })), 5000)
      return () => clearTimeout(timer)
    }
  }, [flash])
  if (!visible.notice && !visible.alert) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4">
      <div
        role="status"
        className={
          'pointer-events-auto rounded-lg px-4 py-2.5 text-sm shadow-lg ' +
          (visible.alert ? 'bg-clay-500 text-white' : 'bg-loam-900 text-white')
        }
      >
        {visible.alert ?? visible.notice}
      </div>
    </div>
  )
}
