// After a deploy, a tab opened on the previous build still asks for the old
// hashed chunks (a panel, a sheet loaded on demand) and the server no longer
// has them: « Failed to fetch dynamically imported module ». Vite announces
// it with a `vite:preloadError` event; reloading the page fetches the new
// build and the person carries on where they were.
const STORAGE_KEY = 'terranova:stale-chunk-reload-at'
// A second failure this soon after a reload is not a stale tab: let it reach
// the error tracker instead of reloading forever.
const GUARD_MS = 10_000

type Env = {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
  pendingWrites: () => number
  now: () => number
}

/** Returns true when the page is being reloaded for a fresh build. */
export function handleStaleChunk(event: { preventDefault: () => void }, env: Env): boolean {
  // Never throw away a change that is still on its way to the server.
  if (env.pendingWrites() > 0) return false
  let last = 0
  try {
    last = Number(env.storage.getItem(STORAGE_KEY)) || 0
  } catch {
    // Storage refused (private mode, policy): reload without the guard.
  }
  const now = env.now()
  if (last && now - last < GUARD_MS) return false
  try {
    env.storage.setItem(STORAGE_KEY, String(now))
  } catch {
    // ignore
  }
  event.preventDefault()
  env.reload()
  return true
}

export function installStaleChunkReload(pendingWrites: () => number): void {
  window.addEventListener('vite:preloadError', (event) => {
    handleStaleChunk(event, {
      storage: window.sessionStorage,
      reload: () => window.location.reload(),
      pendingWrites,
      now: () => Date.now(),
    })
  })
}
