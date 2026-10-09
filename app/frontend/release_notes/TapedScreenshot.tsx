import clsx from 'clsx'
import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { t } from '@/lib/i18n'

/**
 * A screenshot taped into the notebook: a white-bordered print, a little
 * askew, held by two strips of tape. It straightens when hovered; a click
 * opens it full size.
 */
export function TapedScreenshot({ url, alt, title, tilt = 'left' }: { url: string; alt: string; title: string; tilt?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('release_notes.screenshot.enlarge')}
        className={clsx(
          'group relative block w-full cursor-zoom-in rounded-[3px] bg-white p-1.5 pb-2 text-left shadow-[0_10px_24px_-14px_rgba(60,50,30,.55)] ring-1 ring-loam-900/10',
          'transition duration-500 ease-out hover:rotate-0 hover:shadow-[0_18px_34px_-18px_rgba(60,50,30,.6)] focus-visible:rotate-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-prune-600',
          'motion-reduce:transition-none',
          tilt === 'left' ? '-rotate-[0.8deg]' : 'rotate-[0.7deg]',
        )}
      >
        <img src={url} alt={alt} loading="lazy" decoding="async" className="block aspect-[16/10] w-full rounded-[2px] bg-loam-100 object-cover object-top" />
        <Tape className="-top-2.5 left-6 -rotate-6" />
        <Tape className="-top-2.5 right-6 rotate-[5deg]" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="wide">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-loam-50 p-3 sm:p-5">
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-md object-contain shadow-sm" />
        </div>
      </Dialog>
    </>
  )
}

/** A strip of paper tape, slightly translucent with torn ends. */
function Tape({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx('pointer-events-none absolute h-5 w-16 bg-humus-100/75 shadow-[0_1px_2px_rgba(60,50,30,.15)] mix-blend-multiply', className)}
      style={{ clipPath: 'polygon(3% 0, 97% 4%, 100% 30%, 96% 55%, 100% 100%, 2% 96%, 0 70%, 4% 45%, 0 15%)' }}
    />
  )
}
