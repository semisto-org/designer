export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  // « Quatre couronnes »: one tree seen from above at years 1, 5, 15 and 30.
  // Drawn by script/icons.mjs, like the app icons.
  return <img src="/icon.svg" alt="" aria-hidden="true" className={className} />
}

/** The charte's lockup: « semisto » in serif, a thin vertical rule, then the
 * product name in lowercase sans. */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean | 'mobile' }) {
  // 'mobile' drops the product name below the sm breakpoint only.
  const productClass = compact === 'mobile' ? 'max-sm:hidden ' : ''
  return (
    <span className={'inline-flex items-center gap-2 leading-none ' + (className ?? '')}>
      <span className="font-serif text-[1.6rem] font-semibold tracking-tight text-prune-800">semisto</span>
      {compact !== true && (
        <>
          <span aria-hidden="true" className={productClass + 'h-5 w-px bg-prune-300'} />
          <span className={productClass + 'text-[0.95rem] font-medium lowercase text-loam-600'}>designer</span>
        </>
      )}
    </span>
  )
}
