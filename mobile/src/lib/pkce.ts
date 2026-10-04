import * as Crypto from 'expo-crypto'

// RFC 7636: a random verifier and its S256 challenge, both base64url.
export function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createPkce(): Promise<{ verifier: string; challenge: string; state: string }> {
  const verifier = base64Url(Crypto.getRandomBytes(48))
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)), state: base64Url(Crypto.getRandomBytes(16)) }
}
