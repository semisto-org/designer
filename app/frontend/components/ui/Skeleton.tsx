import clsx from 'clsx'

/**
 * Where content is coming: paper that breathes softly, in the shape of what
 * will appear. Keeps the page from jumping when the data lands.
 */
export function Skeleton({ shape = 'line', className }: { shape?: 'line' | 'block' | 'circle'; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'block animate-pulse bg-loam-200/70 motion-reduce:animate-none',
        shape === 'line' && 'h-4 rounded-full',
        shape === 'block' && 'h-32 rounded-2xl',
        shape === 'circle' && 'h-10 w-10 rounded-full',
        className,
      )}
    />
  )
}

/** A few lines of text to come, the last one shorter, as a paragraph ends. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span role="status" aria-busy="true" className={clsx('block space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </span>
  )
}
