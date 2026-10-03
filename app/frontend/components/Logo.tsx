export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  // A leaf over a contour line: design on a real terrain.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#5b5781" />
      <path d="M6 22c4-3 8-3 10 0s6 3 10 0" fill="none" stroke="#b4acce" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 6c5 2 7 6 6 11-5 0-8-3-8-8 0-1 1-2 2-3z" fill="#87b88a" />
      <path d="M15 16c1-3 3-5 6-7" fill="none" stroke="#264f2b" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
