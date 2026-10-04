import Constants from 'expo-constants'

// The server the app talks to: production unless app.json says otherwise
// (a local server during development, e.g. http://192.168.1.20:3000).
export const API_URL: string = String(Constants.expoConfig?.extra?.apiUrl ?? 'https://designer.semisto.org').replace(/\/$/, '')

// Must match MobileApp on the server (app/models/mobile_app.rb).
export const OAUTH_CLIENT_ID = 'semisto-designer-mobile'
export const OAUTH_REDIRECT_URI = 'org.semisto.designer://oauth'
