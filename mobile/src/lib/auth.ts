// Sign-in through the server's OAuth endpoints (MobileApp on the server):
// the system browser shows the usual sign-in (magic link or Google) and a
// consent page, then hands back a code that we exchange, with the PKCE
// verifier, for an access token (1 h) and a rotating refresh token (90 d).
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { API_URL, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI } from './config'
import { createPkce } from './pkce'

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number }

const STORE_KEY = 'designer.tokens'
const PENDING_KEY = 'designer.oauth.pending'

let cached: Tokens | null | undefined
let refreshing: Promise<Tokens | null> | null = null
const listeners = new Set<(signedIn: boolean) => void>()

export function onAuthChange(listener: (signedIn: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function save(tokens: Tokens | null) {
  cached = tokens
  if (tokens) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(tokens))
  else await SecureStore.deleteItemAsync(STORE_KEY)
  listeners.forEach((listener) => listener(!!tokens))
}

export async function loadTokens(): Promise<Tokens | null> {
  if (cached !== undefined) return cached
  const raw = await SecureStore.getItemAsync(STORE_KEY)
  cached = raw ? (JSON.parse(raw) as Tokens) : null
  return cached
}

function fromResponse(body: { access_token: string; refresh_token: string; expires_in: number }): Tokens {
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + body.expires_in * 1000 }
}

async function tokenRequest(params: Record<string, string>): Promise<Response> {
  return fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: OAUTH_CLIENT_ID, ...params }).toString(),
  })
}

export type SignInResult = 'signed_in' | 'cancelled' | 'denied' | 'failed'

export async function signIn(): Promise<SignInResult> {
  const { verifier, challenge, state } = await createPkce()
  // Kept in case the magic link opens in another browser and the app is
  // reopened from the redirect instead of this auth session.
  await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify({ verifier, state }))
  const query = new URLSearchParams({
    response_type: 'code', client_id: OAUTH_CLIENT_ID, redirect_uri: OAUTH_REDIRECT_URI,
    code_challenge: challenge, code_challenge_method: 'S256', state,
  })
  const result = await WebBrowser.openAuthSessionAsync(`${API_URL}/oauth/authorize?${query}`, OAUTH_REDIRECT_URI)
  if (result.type !== 'success') return 'cancelled'
  return completeSignIn(result.url)
}

/** Finishes sign-in from the redirect URL (org.semisto.designer://oauth?code=…). */
export async function completeSignIn(url: string): Promise<SignInResult> {
  const pendingRaw = await SecureStore.getItemAsync(PENDING_KEY)
  if (!pendingRaw) return 'failed'
  const pending = JSON.parse(pendingRaw) as { verifier: string; state: string }
  const params = new URL(url).searchParams
  if (params.get('state') !== pending.state) return 'failed'
  if (params.get('error') === 'access_denied') return 'denied'
  const code = params.get('code')
  if (!code) return 'failed'
  const response = await tokenRequest({
    grant_type: 'authorization_code', code, redirect_uri: OAUTH_REDIRECT_URI, code_verifier: pending.verifier,
  })
  await SecureStore.deleteItemAsync(PENDING_KEY)
  if (!response.ok) return 'failed'
  await save(fromResponse(await response.json()))
  return 'signed_in'
}

/** A valid access token, refreshed when it expires within a minute. Null when signed out. */
export async function accessToken({ force = false } = {}): Promise<string | null> {
  const tokens = await loadTokens()
  if (!tokens) return null
  if (!force && tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken
  refreshing ??= refresh(tokens).finally(() => { refreshing = null })
  return (await refreshing)?.accessToken ?? null
}

async function refresh(tokens: Tokens): Promise<Tokens | null> {
  let response: Response
  try {
    response = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
  } catch {
    // Offline: keep the tokens, the caller works from local data.
    return tokens
  }
  if (response.ok) {
    const next = fromResponse(await response.json())
    await save(next)
    return next
  }
  if (response.status === 400 || response.status === 401) await save(null)
  return null
}

export async function signOut(): Promise<void> {
  const tokens = await loadTokens()
  if (tokens) {
    fetch(`${API_URL}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: OAUTH_CLIENT_ID, token: tokens.refreshToken }).toString(),
    }).catch(() => undefined)
  }
  await save(null)
}
