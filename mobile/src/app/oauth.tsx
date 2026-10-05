// The sign-in redirect (org.semisto.designer://oauth?code=…) also opens this
// route when it reaches the app from Safari. SessionProvider finishes the
// sign-in; here we only go back to the home screen, which shows the maps
// once signed in, or the sign-in screen otherwise.
import { Redirect } from 'expo-router'

export default function OAuthRedirect() {
  return <Redirect href="/" />
}
