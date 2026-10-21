# Semisto Terranova — phone app

The companion of a Terranova map on the terrain (iOS and Android, Expo /
React Native, MapLibre Native). Published by Semisto ASBL as « Semisto
Terranova », identifier `org.semisto.designer`.

What it does, for the maps one belongs to:

- shows the map and the design around the person's position (GPS, heading),
  under one sheet (`ui/Sheet.tsx`, `terrain/SheetContent.tsx`): at rest the
  day, the help center's card of the month (`app/help/seasons.yml`, copied
  by `npm run locales`) and « Autour de moi », the elements within 30 m
  nearest first (also the screen reader's way to the map); « Noter ici »;
  a chosen element with its age (« a passé 2 hivers ici »), its distance
  and direction, and one-tap gestures (« Planté aujourd'hui » with undo);
- « Il y a un an, ici » (`lib/memory.ts`): at rest, the sheet shows what
  happened on the terrain around today's date in the latest earlier year
  that has something (photos, plants put in the ground, elements built),
  read from the bundle, so it shows offline too;
- site visits (« Commencer une visite », `lib/visit.ts`, `lib/visit-core.ts`):
  each note is a note point placed where one stands, sorted by theme in one
  tap (wishes, water, soil, trees already there…, the themes of Semisto's
  first visits) and carrying the visit's key; « Terminer la visite » sends
  `POST /maps/:id/site_visits` through the outbox, and the server files the
  report in the map's documents, with the chosen questions as tasks
  (`SiteVisit`);
- the planting round (« Tournée de plantation », `lib/tour.ts`): from the
  blue dot to the nearest plant still to plant, with an arrow turned by the
  compass and the distance, « Tu y es » within 2 m (or the GPS accuracy, at
  most 6 m), then « Planté ! », « Planté ici » (moves the plant to where it
  really went in) or « Passer »;
- the map opens framed on the place's outline (`boundsOf`); plants are
  small discs in their strata's colour (`STRATA_COLORS`, as on the
  website) that, from zoom 19, grow to carry the plant's number (white or
  ink, `inkOn`), other points carry the glyph of what they are (`pointIcon`,
  white PNGs in `assets/map-icons/` drawn by `scripts/map-icons.mjs`);
  sectors stay off the phone's map, and the map's sources open from a
  paper « i » under the back button;
- downloads a map for offline use (map data + base map tiles of the
  terrain, zoom 12–19) and keeps every change in an outbox sent when the
  network is back;
- drone views of the map (« Affichage » › « Vue drone », `useMapStyle`):
  one laid over the base map (`/api/v1/maps/:id/style?drone=id`), loaded
  through the connection as one moves, or kept on the phone as its own
  offline pack (zoom 15 up to the view's own); offline, a view not kept
  leaves the base map alone. A PMTiles archive is read by the server, tile
  by tile (`/api/v1/maps/:id/aerial_views/:id/tiles/:z/:x/:y`,
  `AerialViews::PmtilesReader`), since MapLibre sends the token only to the
  API and a signed file link expires;
- geolocated photos, on the map or on an element, with the direction the
  camera faced;
- a photo taken again from the same spot (« Reprendre cette photo »,
  `lib/retake.ts`, screen `retake/[photoId]`, expo-camera): the earlier
  photo shows faintly over the camera, the blue dot leads to where it was
  taken and the compass turns the person to face the same way; the new
  photo joins the series (`MapPhoto#retake_of`) and the photo screen wipes
  from before to after (`ui/BeforeAfter.tsx`); the sheet lists the photos
  already taken where one stands (« Déjà photographié ici »);
- « Esquisser sur la photo » (screen `sketch/[photoId]`, `lib/sketch.ts`,
  `ui/SketchLayer.tsx`, `state/useSketches.ts`): draw over a photo with a
  finger, in the website's inks and widths, with handwritten notes, an
  eraser and undo; the same `PhotoSketch` as the website's sketcher, saved
  online (`/maps/:id/photos/:id/sketches`, a 409 brings back the other
  person's version); the photo screen lays one sketch at a time over it;
- plants: place a plant where one stands, mark it planted; its journal
  (`lib/journal.ts`) notes a take, flowering, pruning, damage, disease or an
  intervention in one tap, and shows the plant's life as a frieze by year
  (« 2026 · année 3 »): planting, notes, harvests with the first one marked,
  photos;
- survey: a GPS point, or a walked trace saved as a line or a closed
  surface (keeps recording with the screen off; GPS jumps faster than a
  walk are dropped, `cleanTrace`);
- « Mesurer » (`app/maps/[id]/measure.tsx`, `lib/measure.ts`): corners
  tapped on the map or taken with « Point ici » where one stands; length,
  area in m², ares or hectares, perimeter and each side's length live on the
  map, then « Ajouter à la carte » hands the shape to the record screen;
- species identification with Pl@ntNet (through the server), each photo
  tagged with the organ it shows (leaf, flower, fruit, bark, whole plant),
  and a « Déjà dans ta palette » badge on candidates the map already holds;
- quick survey of wild plants (`app/maps/[id]/bioindicator.tsx`,
  `lib/survey.ts`): each plant gets a cover class (sent as `cover_percent`,
  which sets the abundance), the screen stays open for the next plant, and
  the plants noted so far add up to a soil reading weighted by their cover;
- « Cette semaine chez toi » at the top of the map screen
  (`terrain/WeekCard.tsx`, `lib/week.ts`, `state/useWeek.ts`, server
  `GET /maps/:id/week`, `WeekReport`): the frost still ahead with the
  plants it reaches and what to do the evening before, a heat alert, the
  week's nights and days, what the plants placed on the map do this month,
  and the tasks due within a week; online only, kept for the session;
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
  `/api/v1/maps`, `/api/v1/maps/:id`, `/api/v1/maps/:id/style`, a drone
  view's tiles) and the map
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

## Errors and updates

- Crashes and errors go to Sentry (project `terranova-mobile` of the
  organisation `marco-vespucci-sprl`) when the build has
  `EXPO_PUBLIC_SENTRY_DSN`; without it nothing is sent. The DSN lives in
  the GitHub secret `MOBILE_SENTRY_DSN`: « Mobile build » copies it into the
  EAS environment variables before building, « Mobile update » bundles with
  it. For a build made from a computer, run `eas env:set` once with it.
  Source maps are not uploaded yet (`SENTRY_DISABLE_AUTO_UPLOAD` in
  `eas.json`) until a `SENTRY_AUTH_TOKEN` is set.
- JavaScript-only changes reach installed builds over the air: GitHub
  Actions « Mobile update », channel = the build profile (`testflight` for
  the test app). The runtime version is the native fingerprint, so an update
  never reaches a build whose native modules differ; adding a native module
  needs « Mobile build ».

## Release

`eas.json` profiles:

- `development`: dev client, internal.
- `preview`: internal; Android APK to install directly.
- `simulator`: the test app for the iOS Simulator on a Mac (no Apple
  account needed).
- `testflight`: store build of the test app, sent to TestFlight.
- `production`: store builds of « Semisto Terranova ».

`development`, `preview`, `simulator` and `testflight` set `APP_VARIANT=preview`:
`app.config.ts` then builds « Terranova (test) » with the identifier
`org.semisto.designer.preview` (Android package `org.semisto.designertest`,
as created in the Play Console), which installs next to the store app and
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
