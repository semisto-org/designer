# Semisto Designer — phone app

The companion of a Designer map on the terrain (iOS and Android, Expo /
React Native, MapLibre Native). Published by Semisto ASBL as « Semisto
Designer », identifier `org.semisto.designer`.

What it does, for the maps one belongs to:

- shows the map and the design around the person's position (GPS, heading);
- downloads a map for offline use (map data + base map tiles of the
  terrain, zoom 12–19) and keeps every change in an outbox sent when the
  network is back;
- geolocated photos, on the map or on an element;
- plants: place a plant where one stands, mark it planted, record its
  reprise and vigueur with a photo;
- survey: a GPS point, or a walked trace saved as a line or a closed
  surface (keeps recording with the screen off);
- species identification with Pl@ntNet (through the server);
- comments on elements;
- « Supprimer mon compte » (account screen): sends the deletion request to
  Semisto (`POST /api/v1/me/deletion_request`), as the stores require.

No purchase happens in the app: plans are managed on the website.

## How it talks to the server

- Sign-in is the server's OAuth 2.1 (code + PKCE) with the fixed public
  client `semisto-designer-mobile` (`app/models/mobile_app.rb`), redirect
  `org.semisto.designer://oauth`, scope `app`. Tokens live in the
  keychain/keystore (expo-secure-store).
- The bearer token reaches the app's own endpoints (`/api/v1/me`,
  `/api/v1/maps`, `/api/v1/maps/:id`, `/api/v1/maps/:id/style`) and the map
  editor's JSON endpoints, with the same roles as on the website.
- Interface strings come from `config/locales/*.fr.yml` (mostly
  `mobile.fr.yml`) and the element library from `config/map_elements.yml`:
  `npm run locales` copies what the app needs into `src/i18n/` (CI checks
  the copies are up to date). Never edit `src/i18n/*.json` by hand.

## Develop

```bash
cd mobile
npm install
npm run locales     # after changing config/locales or config/map_elements.yml
npm run typecheck
npm test
```

MapLibre Native and the background location task need a development build
(not Expo Go):

```bash
npx eas build --profile development --platform ios     # or android
npx expo start --dev-client
```

The app talks to `extra.apiUrl` in `app.json` (production by default). To
use a local server, set it to the computer's address on the local network
(e.g. `http://192.168.1.20:3000`) for the development build only.

## Release

`eas.json` profiles:

- `development`: dev client, internal.
- `preview`: internal; Android APK to install directly.
- `simulator`: the test app for the iOS Simulator on a Mac (no Apple
  account needed).
- `testflight`: store build of the test app, sent to TestFlight.
- `production`: store builds of « Semisto Designer ».

`development`, `preview`, `simulator` and `testflight` set `APP_VARIANT=preview`:
`app.config.ts` then builds « Designer (test) » with the identifier
`org.semisto.designer.preview`, which installs next to the store app and
can live in any Apple developer account. The URL scheme stays
`org.semisto.designer`, so the OAuth redirect is unchanged.

```bash
npx eas build --profile testflight --platform ios --auto-submit
npx eas build --profile preview --platform android    # APK link
npx eas build --profile production && npx eas submit  # stores
```

From GitHub: Actions, « Mobile build », « Run workflow » (profile and
platform), with the repository secret `EXPO_TOKEN` (robot token of the Expo
organisation `semisto.org`). The build runs on Expo; its page on expo.dev has the
APK link or the TestFlight status. The first iOS build is made once from a
computer, where Apple asks for its account to create the certificate.

Google Play: the `testflight` profile on Android gives the same test app as an
Android App Bundle (`.aab`), uploaded by hand to the Play Console's internal
testing track (Google takes the first upload of an app only from the
console). Automatic submission needs a Play service account key added to
EAS; until then the workflow auto-submits iOS builds only.

Store reviewers sign in on the server's sign-in page with « Accès pour la
relecture des stores », enabled by `APP_REVIEW_EMAIL` and `APP_REVIEW_CODE`
(16+ characters) on the server; `bin/rails app_review:prepare` gives that
account a demo map (or `MAP_ID=…` to share an existing one with it).
