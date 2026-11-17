import { t } from '@/lib/i18n'

export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  // « Quatre couronnes »: one tree seen from above at years 1, 5, 15 and 30.
  // Drawn by script/icons.mjs, like the app icons.
  return <img src="/icon.svg" alt="" aria-hidden="true" className={className} />
}

/** The charte's lockup: « semisto » in serif, a thin vertical rule, then the
 * product name in lowercase sans, and a small « bêta » tag while Terranova is
 * in beta (stays visible on a phone, even when the product name is dropped). */
export function Wordmark({ className, compact = false, beta = true }: { className?: string; compact?: boolean | 'mobile'; beta?: boolean }) {
  // 'mobile' drops the product name below the sm breakpoint only.
  const productClass = compact === 'mobile' ? 'max-sm:hidden ' : ''
  return (
    <span className={'inline-flex items-center gap-2 leading-none ' + (className ?? '')}>
      <span className="font-serif text-[1.6rem] font-semibold tracking-tight text-prune-800">semisto</span>
      {compact !== true && (
        <>
          <span aria-hidden="true" className={productClass + 'h-5 w-px bg-prune-300'} />
          <span className={productClass + 'text-[0.95rem] font-medium lowercase text-loam-600'}>terranova</span>
        </>
      )}
      {beta && (
        <span
          title={t('brand.beta_hint')}
          className="ml-0.5 rounded-full border border-humus-300 bg-humus-50 px-1.5 py-px text-sm font-medium lowercase leading-none text-humus-700"
        >
          {t('brand.beta')}
        </span>
      )}
    </span>
  )
}
