# CLAUDE.md — Semisto Designer

Open-source (AGPL-3.0) web app to map a real terrain and design a forest garden or permaculture plan on it, with an AI that knows the place. Hosted by Semisto at https://designer.semisto.org. Product plan: `/mnt/project-files/designer/plan.md` (when available) — the v1 scope is steps 1 to 4 of its roadmap.

## Point of view (read before any design or copy work)

`docs/point-de-vue.md` (French) is the product's point of view, decided with Michael: the European reference for designing one's own forest garden; a companion that teaches you to read your place; **the time of living things** runs through every detail (seasons, growth, before and after); the visual language is a **living field notebook** (paper, watercolour, handwritten notes). It ends with a five-question test for any screen. The home page time-lapse (`app/frontend/components/site/timelapse/`) is the reference for how bold a proposal should be: a design that stays in the usual SaaS template is not done.

## Stack (decided, do not change)

- Rails 8.1, Ruby 3.3, PostgreSQL 16+ with **PostGIS** (`activerecord-postgis-adapter`, RGeo, SRID 4326 everywhere; measure in meters with `::geography`).
- **Inertia** (`inertia_rails`) + **React 19 + TypeScript** + **Vite** (`vite_rails`). No Hotwire, no importmap.
- **MapLibre GL JS** (map), **Terra Draw** (drawing), **turf** (client geometry), **three.js** (3D relief).
- Tailwind CSS 4 with the **Semisto Design System** (Claude Design export in `docs/design-system/`, read its README before any visual work). Tokens in `app/frontend/entrypoints/application.css`: `prune` (brand plum), `loam` (neutrals, beige clair to ink), `leaf` (artichaut, design pole and success), `humus` (mangue, attention), `lichen`, `clay` (grenade, errors). Inter (`font-sans`) for UI and body, EB Garamond (`font-serif`) for h1/h2 and display, **never in italics**; fonts self-hosted through `@fontsource-variable`. Buttons are pills, cards 16 px radius.
- Solid Queue / Cache / Cable. Auth: Rails 8 sessions + Google (OmniAuth) + magic links. **No passwords, no Devise.**
- Minitest (+ WebMock: external HTTP is always stubbed in tests). Playwright for screenshots (`script/screenshot.mjs`).

## Language

- **Code, comments, commit messages: English.**
- **Interface: French only (v1)**, through Rails I18n files: `config/locales/*.yml`. The React frontend imports the same YAML files (`app/frontend/lib/i18n.ts`, `t('key')`). Never hardcode French strings in components or controllers. Each feature area owns its own file `config/locales/<area>.fr.yml` (top-level key `fr:`), to avoid merge conflicts.
- French typography in UI copy: sentence case for titles (« Mes cartes », not « Mes Cartes »), `«  »` quotes, non-breaking feel; friendly, concrete, encouraging tone (the "particulier" designing their own forest garden is the core user).

## Layout

- Pages: `app/frontend/pages/<controller_path>/<action>.tsx` (Inertia component name = `"#{controller_path}/#{action}"`). Default layout is chosen in `app/frontend/entrypoints/inertia.tsx` (AppLayout, PublicLayout, or none for full-screen pages).
- UI primitives: `app/frontend/components/ui/*` (Button, Field/Input/Select/Textarea, Card, EmptyState, Flash). Reuse them.
- Shared props (`ApplicationController#inertia_share`): `currentUser`, `entitlements`, `env`. Types in `app/frontend/types/index.ts`.
- JSON endpoints for the map editor live next to the pages (`respond_to :json` or dedicated `Maps::*Controller`), called with `api()` from `app/frontend/lib/api.ts` (CSRF handled).
- **Map editor** (`pages/maps/show.tsx`): full-screen MapLibre (`map/MapView.tsx`) + `EditorContext` (`map/editor/EditorContext.tsx`). Panels and tools go through `useEditor()`: `features`, `createFeature`, `updateFeature` (optimistic locking with `lockVersion`), `deleteFeature`, `select`, `draw(shape)` (Terra Draw, resolves a GeoJSON geometry or null), `notify`, `regionLayers`, `entitlements`, `canEdit`.
  - Register a side panel in `app/frontend/map/panels/index.ts` (`PANELS`, groups: `map`, `understand`, `design`, `share`) and inspector sections for a selected feature in `INSPECTOR_SECTIONS`. One line per entry.
  - MapLibre sources/layers helpers live in `app/frontend/map/layers/*`. Use stable ids; install idempotently.
- Everything drawn on a map is a `MapFeature` (PostGIS `geometry`, `layer` = existing | water | access | structures | plants | animals | networks | notes, free `kind`, `properties` jsonb, `status` active | draft | rejected, `source` human | ai, `rationale`). Prefer adding a `kind` + `properties` over a new table, unless the object has real relations (plants → species, comments, photos…).
- External APIs: one class per provider under `app/services/providers/` behind a small stable interface, configured by ENV, with a graceful "not configured / unavailable" state (UI disables the feature instead of failing). Server calls go through Faraday with timeouts; cache responses with `Rails.cache`.
- Regions (`Region`, `RegionLayer`): everything territory-specific (layers, cadastre, elevation, rules, native species) hangs off the map's region. Never hardcode Wallonia in code paths; seed it.
  - Seeded: `europe` (pan-European base, no outline) and Wallonia, France, Luxembourg (`parent` = europe, `outline` from `db/seeds/regions/*.geojson`). A map's region comes from its place (`Region.for_point`, `Map#locate_region`); a map outside every outline belongs to `europe` and moves to a region once its place falls in one.
  - Inheritance: read layers through `region.catalogue` (own layers + the parent's not replaced by key), never `region.layers`, and settings through `region.setting(...)` (a top-level key comes whole from the region, else from the parent).
  - Providers chosen per region in settings: `relief.provider` (arcgis_elevation, geopf_altimetry, copernicus_dem), `cadastre.provider` (default: the ArcGIS layer with `options.role = cadastre`; apicarto, inspire_wfs). A new relay host goes into `Providers::GeoHttp::RELAY_HOSTS`.
- Plans and paid features: `Entitlements` (`app/models/entitlements.rb`). A map's features follow its **owner's** plan (`Entitlements.for_map(map)`). While Stripe is not configured, everything is unlocked (beta).
- Roles per map: owner (1), editors (max 3, free), viewers (unlimited, read + comment). `MapScoped` concern: `set_map`, `require_editor!`, `require_owner!`.
- Teams (`Organization`, UI « Équipes », `/teams`): roles admin | member, always one admin. Members of a map's team are editors of it without taking a seat (`Map#role_for`, `Map#participants`); team admins manage the team only, never a map's sharing. Only the owner moves a map in or out (`Maps::TeamsController`, « Partager » dialog). A team map still follows its owner's plan; leaving a team does not take one's maps out of it.

## Databases

`config/database.yml` derives the development and test database names from the working directory path, so each worktree/clone has its own (no shared, mixed schema). `bin/rails db:prepare` creates them. Never dump `db/schema.rb` from a database that ran other branches' migrations.

## Commands

- `bin/rails db:prepare db:seed` — databases + regions and layer catalogue.
- `bin/rails test` — must stay green. Add tests for every model, controller and service you write.
- `npx tsc -p tsconfig.app.json` — TypeScript must stay clean.
- `bin/rails s` + `RAILS_ENV=development bin/vite build` (or `bin/vite dev`); sign in locally at `/dev/login?email=dev@semisto.org&return_to=/maps` (development only).
- `CHROMIUM_PATH=/opt/pw-browsers/chromium node script/screenshot.mjs /maps/1 tmp/shot.png [--mobile]` — screenshot as the dev user (in the cloud sandbox, external tile servers and geoservices.wallonie.be are blocked; layout still renders).

## Data and licences (non-negotiable)

- Plant data provenance is stored **per field** (source, upstream source, licence, status: sourced / to_verify / empty).
- PFAF: values may be shown, each citing PFAF as source; **never copy PFAF texts or images**.
- Rekentool (Dutch financial tool): **no data from it** in the repo or UI.
- Open-Meteo free API is non-commercial: weather/climate go through a configurable provider with an "unavailable" state.
- Code ported from Claudy (MIT, © Fondation Les 4 Sources) keeps a header comment: `# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)`. Terranova has no licence and contains personal data: port logic file by file, never data or history.
- Sensitive layers (networks: water, gas, electricity, ethernet) are hidden by default in public views, exports and the MCP.

## Billing, public site and help center

- Billing is off without `STRIPE_SECRET_KEY` (`Billing.enabled?`): everything is unlocked. Prices are cents in `Billing::Catalog` and must match the Stripe prices (tax inclusive); Stripe ids come from `STRIPE_PRICE_*`. All Stripe calls go through `Providers::StripeGateway` (stub it with WebMock in tests; `test/test_helpers/billing_test_helper.rb` has the payload builders). Webhook events are stored once in `StripeEvent` (idempotent); every payment lands in `BillingPayment` (the revenue-share ledger).
- A user's plan is `User#current_plan_key`. Maps beyond the plan's limit are read-only (`Map#read_only_by_plan?`, enforced in `MapScoped#require_editor!`, `readOnlyByPlan` in the map props, badge in the editor header). Nothing is ever deleted when a pass expires.
- Public pages (`PagesController`, `app/frontend/pages/pages/*`) render server-side meta tags through `PublicMeta#render_public` and the page copy lives in `config/locales/site.fr.yml` (read with `content()` / `tf()` from `lib/content.ts`, which also applies French typography). The legal pages are drafts marked « Projet — à valider ».
- Help center: Markdown articles in `app/help/*.md` (front matter: title, summary, category, order), served by `HelpController` (`/help`, `/help/:slug`, and `.json` for both). Put `<HelpButton slug="…" />` (components/help) next to any screen that needs contextual help.
- Design method for AI agents: Markdown chapters in `app/design_guides/*.md` (front matter: title, summary, order, status), **written in English** like all repository content except the UI locales and help articles; served by the MCP tool `get_design_guide` (`DesignGuide`). Semisto's design knowledge goes there, not into code or a client-side skill.

## Phone app (`mobile/`)

- Expo (React Native) + MapLibre Native, its own `package.json`; CI job `mobile` runs `npm run locales -- --check`, `npm run typecheck`, `npm test`. See `mobile/README.md`.
- Signs in through the server's OAuth with the fixed client `MobileApp` (scope `app`, never granted to another client); its bearer token acts as the user on `/api/v1/*` and on the editor's JSON endpoints. A new editor endpoint the app needs works as is; keep bearer requests in mind (no CSRF, 401 instead of a redirect).
- Strings: `config/locales/mobile.fr.yml` (plus shared keys listed in `mobile/scripts/locales.mjs`), copied into `mobile/src/i18n/` by `npm run locales`. No in-app purchase or link to plans (store rules): plans live on the website.
