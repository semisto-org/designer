// Custom events for Semisto's self-hosted Plausible (no cookie, no personal
// data): the script is on the page only when PLAUSIBLE_DOMAIN is set (see
// ApplicationHelper#plausible_script_tag); without it, nothing is sent.
// Events sent before the deferred script has loaded wait in its queue.
type Plausible = ((event: string, options?: { props?: Record<string, string | number | boolean> }) => void) & { q?: unknown[] }

export function track(event: string, props?: Record<string, string | number | boolean>) {
  const w = window as unknown as { plausible?: Plausible }
  if (!w.plausible && !document.querySelector('script[data-domain]')) return
  w.plausible ??= Object.assign((...args: unknown[]) => { (w.plausible!.q ??= []).push(args) }, {}) as Plausible
  try {
    w.plausible(event, props ? { props } : undefined)
  } catch {
    // Measuring never breaks the page.
  }
}
