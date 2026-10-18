# Deployment

Reference for Semisto Terranova's production settings (https://terranova.semisto.org). Every variable below is read by the code; a missing variable cleanly turns the matching feature off (the interface says so instead of failing).

Interface labels are quoted in French, as they appear in the app.

## Hosting

- Image: `Dockerfile` at the root. On boot, `bin/docker-entrypoint` runs `bin/rails db:prepare` then `bin/rails db:seed` (idempotent: regions, Géoportail layers, starter catalogue, climate data, indicative rules).
- Port 80 (Thruster in front of Puma). Health check: `GET /up`.
- PostgreSQL 16 **with PostGIS** (suggested image: `postgis/postgis:16-3.4`). The user must be able to create databases and the `postgis`, `citext` and `unaccent` extensions (or an administrator creates them beforehand).
- Four databases are created from `DATABASE_URL`: the main one, then `_cache`, `_queue` and `_cable`.
- Files (photos, lab PDFs, imported relief): S3 storage as soon as `S3_BUCKET` is set, otherwise the local disk `/rails/storage`, which must then be mounted on a **persistent volume** (otherwise everything disappears on the next deployment). A named Docker volume works as is; a host folder must belong to the image's user (`chown -R 1000:1000 <folder>`), otherwise uploads fail.
- DNS: `terranova.semisto.org` → A/AAAA record to the VPS; the TLS certificate is handled by the VPS proxy.
- Automatic deployment: `.github/workflows/deploy.yml` asks Coolify's API for a deployment after each green CI on `main` (or by hand, from the Actions tab). In GitHub (Settings, Secrets and variables, Actions): the secret `COOLIFY_TOKEN` (a Coolify API token with the "deploy" permission) and the variable `COOLIFY_APP_UUID` (the id of the `designer` application, visible in its Coolify URL); `COOLIFY_URL` is optional (default `https://dash.semisto.org`). Without these settings, the workflow does nothing.

## Environment variables

### Required

| Variable | Role |
|---|---|
| `SECRET_KEY_BASE` | Session encryption key (`bin/rails secret`). |
| `DATABASE_URL` | `postgres://user:password@host:5432/designer_production` (`postgis://` accepted). The database name is required: the other three derive from it. |
| `APP_HOST` | `terranova.semisto.org` (e-mail links, OAuth, sitemap). It is also the only accepted host name: any other domain gets a 403 error, except `/up`. |
| `MAIL_FROM` | Sender, e.g. `Semisto Terranova <designer@semisto.org>`. |
| `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | Sending e-mails: magic-link sign-in, invitations, comments, requests. Without them, the screen says « lien envoyé » but the delivery job fails (visible in the logs and Sentry): nobody can sign in by e-mail. |
| `MAIL_BCC_ADDRESS` | Optional. Blind copy of **every** e-mail sent (sign-in, invitations, comments, invoices…) to this address, e.g. `hello@semisto.org` during the beta; several addresses separated by commas. Empty or missing: no copy. Read on every delivery: removing it (and redeploying) is enough to stop the copies. |
| `SOLID_QUEUE_IN_PUMA` | Optional. By default in production, background jobs (e-mails, relief import, renewal reminders) run inside the web server, on a single machine. `false` turns them off there, to hand them to a separate `bin/jobs` process. |

### Google sign-in

| Variable | Role |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth credentials of type "Web application". |

In the Google Cloud console: authorised origin `https://terranova.semisto.org`, redirect URI `https://terranova.semisto.org/auth/google_oauth2/callback`, scopes `email` and `profile`. Without these variables, only the e-mail magic link is offered.

### Sign in with Apple

| Variable | Role |
|---|---|
| `APPLE_CLIENT_ID` | The Services ID identifier, e.g. `org.semisto.terranova.signin`. |
| `APPLE_TEAM_ID` | Team ID of Semisto ASBL's developer account (10 characters). |
| `APPLE_KEY_ID` | Identifier of the "Sign in with Apple" key. |
| `APPLE_PRIVATE_KEY` | Contents of that key's `.p8` file (real line breaks or `\n`). |

On developer.apple.com (Certificates, Identifiers & Profiles): enable "Sign in with Apple" on the app's App ID, create a Services ID linked to that App ID with the domain `terranova.semisto.org` and the return URL `https://terranova.semisto.org/auth/apple/return`, then create a key with "Sign in with Apple" (the `.p8` can only be downloaded once). To write to people who hide their address (`…@privaterelay.appleid.com`), register the sender (`MAIL_FROM`) under "Sign in with Apple for Email Communication"; its domain must pass SPF and DKIM. The button appears on the sign-in page, so also in the mobile app, which opens it in the phone's browser. Without these variables, it is not offered.

### Payments (Stripe, Semisto ASBL's account)

| Variable | Role |
|---|---|
| `STRIPE_SECRET_KEY` | Turns billing on. Without it, everything is unlocked (beta). |
| `STRIPE_WEBHOOK_SECRET` | Secret of the webhook `https://terranova.semisto.org/webhooks/stripe`. |
| `STRIPE_PRICE_YEARLY` | Forfait particulier (individual pass), one-off payment, €79 VAT included. |
| `STRIPE_PRICE_ATELIER` | Atelier, monthly subscription, €49 VAT included. |
| `STRIPE_PRICE_BUREAU` | Bureau d'études, monthly subscription, €99 VAT included. |
| `STRIPE_PRICE_DRONE` | Mission drone, one-off payment, €280 VAT included. |
| `STRIPE_PORTAL_CONFIGURATION` | Optional: customer portal configuration. |
| `BILLING_DISABLED` | Optional: `true` turns billing off even with a key. |

Webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Prices in EUR, "inclusive" tax, Stripe Tax enabled. Member discount: a 30 % coupon restricted to the Forfait particulier, then one promotion code per member.

**Promotion codes** (« Codes promo », `/admin/promo-codes`, administrators only): makes Stripe promotion codes (beta testers, a partner, a course) without opening the Stripe dashboard. Each code is one Stripe coupon (a percentage or a fixed amount in euros; for subscriptions once, for N months or forever, ignored by one-off payments) restricted to the products of the plans ticked (read from their configured `STRIPE_PRICE_*`, so a plan without a price cannot be chosen), plus one promotion code carrying the text, the optional maximum number of uses, expiry date and "first-time customers only" restriction. The internal note, the plans and the creator's e-mail are stored as metadata on both. The screen lists the latest 100 codes from Stripe (then older ones page by page) with their uses and the payments recorded with each code in the ledger, and « Désactiver » switches a code off (Stripe cannot turn it back on; past payments are untouched). Creations and deactivations land in the admin log of the dashboard. Without `STRIPE_SECRET_KEY` the page says payments are not configured and the form is disabled.

### Paying by invoice (municipalities)

Municipalities, schools, associations and companies that cannot pay by card request an invoice from **Formule et facturation** or the **Tarifs** page (« Payer sur facture », `/billing/invoice`): the organisation's name and address, VAT or company number, billing e-mail, purchase order number, and a plan for one year (Atelier 12 × €49, Bureau d'études 12 × €99, Forfait particulier €79, VAT included).

1. The request arrives by e-mail at `SEMISTO_CONTACT_EMAIL` (replying writes to the requester) and in the **Demandes de facture** screen (`/admin/invoice-requests`, linked at the top of `/admin/requests`), for administrators only. To grant that role: `bin/rails users:admin EMAIL=firstname@semisto.org` (the person must have signed in once; `users:unadmin` removes it, `users:admins` lists administrators).
2. **With Stripe**: « Créer la facture dans Stripe » creates a Stripe customer for the organisation (reused when the same organisation renews, never the user's personal customer), adds the EU VAT number if it has that shape (BE0123456789), then e-mails a VAT-inclusive invoice (Stripe Tax), payable within 30 days, with the **purchase order number** as a custom field. The payment is recorded by the `invoice.paid` webhook in the payments ledger (`bin/rails billing:payments`), the request moves to « Payée » and the plan starts if it had not already. In the Stripe settings (Billing → Invoices), enable bank transfer as an invoice payment method.
3. **Without Stripe**: the invoice is made by hand (VAT-inclusive amount, purchase order number); the screen reminds you.
4. « Activer la formule » starts the plan for 12 months from the chosen date (today by default, or the end of the current plan for a renewal), without waiting for payment; the user is told by e-mail. « Marquer comme payée » (also marks the Stripe invoice "paid out of band" if needed) and « Annuler » (voids the Stripe invoice; a plan already started stops) complete the follow-up.

At the end of the term, nothing is deleted: as with the individual pass, maps beyond the free plan become read-only, and reminders go out 30 days before, 7 days before and on the day.

### Files (S3 compatible)

Storage chosen (2026-10): **Infomaniak Public Cloud Object Storage** (Geneva, three copies) for the files, and a nightly copy to **Swiss Backup** (another account, two datacentres).

| Variable | Role |
|---|---|
| `S3_BUCKET` | Turns object storage on (`terranova-media` at Infomaniak, project `semisto-media`). |
| `S3_ENDPOINT` | Infomaniak: the one for the container's region, `https://s3.pub2.infomaniak.cloud` for dc4-a (our `terranova-media` container), `https://s3.pub1.infomaniak.cloud` for dc3-a. An address from another region sees no container (`NoSuchBucket`). Elsewhere: `https://fsn1.your-objectstorage.com` (Hetzner), `https://s3.fr-par.scw.cloud` (Scaleway). |
| `S3_REGION` | Infomaniak: `us-east-1` whatever the region (the server refuses `dc3-a` or `dc4-a`). |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Infomaniak: `openstack ec2 credentials create` (credentials from Horizon's "API Access" tab). |
| `S3_FORCE_PATH_STYLE` | `true` by default. |
| `S3_DIRECT_DOWNLOADS` | `true` to send the browser straight to the bucket, only if the bucket accepts a CORS rule (not at Infomaniak). Otherwise the application serves the files itself. |
| `ACTIVE_STORAGE_SERVICE` | Optional: forces `local` or `object_storage`. |

Files are never public: the application checks the role on the map, then redirects to a signed link valid for a few minutes. The browser reads several of these files from JavaScript (PDFs, base maps, relief, sketches), which needs a CORS rule on the bucket. Infomaniak's object storage offers none (`PutBucketCors` answers `NotImplemented`): by default, the application therefore serves a bucket's files itself, from its own address (Active Storage proxy routes, with byte ranges for pdf.js; `ServesStoredFiles`). At a host that accepts CORS, `S3_DIRECT_DOWNLOADS=true` sends the browser straight to the bucket; `bin/rails storage:cors` (read-only, from `https://APP_HOST`) then sets the rule, and boot sets it again.

#### File backup

| Variable | Role |
|---|---|
| `BACKUP_S3_BUCKET` | Turns on the nightly backup (`FileBackupJob`, every day at 2 am, before the database backup at 3 am). |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION` | Given by Infomaniak when the S3-type Swiss Backup space is created. |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Generated with the Swiss Backup space. |
| `BACKUP_S3_FORCE_PATH_STYLE` | `true` by default. |

Every night, the backup sends the files it does not have yet and never replaces anything. A file deleted in the application (or by someone holding the main keys) stays there for 89 days, long enough to restore a database backup from that period, then the backup erases it: the privacy policy promises backups are erased at most 90 days after a deletion. The delay runs from the first night the file has no trace left in the database (table `backup_orphans`). If more than a quarter of the backup (and more than 100 files) has no trace, the database looks like the wrong one: nothing is marked for erasure and the job fails. A file that could not be copied fails the job (visible in Sentry); the others are copied anyway. Every night, the job also checks in with the Sentry Crons monitor `file-backup` (created on its own on the first run, if `SENTRY_DSN` is set): Sentry alerts when a day goes by without a finished backup, for example because a deployment cut it off, the worker is stopped or the `BACKUP_S3_*` variables have disappeared. `bin/rails storage:backup` runs it by hand; `bin/rails storage:status` counts files per service and says whether the backup is configured.

#### Moving from disk to object storage

1. Create the bucket and the S3 key, set the `S3_*` variables in Coolify, redeploy. New files go to the bucket; old ones are still served from `/rails/storage`.
2. With `S3_DIRECT_DOWNLOADS=true` only: boot sets the bucket's CORS rule (otherwise `bin/rails storage:cors`, from the application's terminal in Coolify).
3. `DRY_RUN=1 bin/rails storage:migrate` to count, then `bin/rails storage:migrate` (by default `FROM=local TO=object_storage`). Each file is copied with its checksum verified, then served from the bucket; it can be run again as often as needed, nothing is copied twice. Files on disk are never deleted.
4. `bin/rails storage:status` should show only `object_storage`. Keep the `/rails/storage` volume for a few weeks before removing it.

### Semisto contacts

| Variable | Role |
|---|---|
| `SEMISTO_CONTACT_EMAIL` | Shown on the site; receives drone mission orders, pay-by-invoice requests and account deletion requests (default `designer@semisto.org`). |
| `SEMISTO_REQUESTS_EMAIL` | Receives « Passer à l'action » requests: plant orders, implementation, co-management (several addresses separated by commas; default `designer@semisto.org`). |

### Map and addresses

| Variable | Role |
|---|---|
| `GEOCODER_PROVIDER` | `nominatim` (default), `photon` or `none`. |
| `GEOCODER_URL` | Optional: another server. |
| `GEOCODER_USER_AGENT_EMAIL` | Contact address required by Nominatim's usage policy. |
| `GEOCODER_FALLBACK` | `photon` (default with Nominatim) or `none`: queried when Nominatim finds nothing or does not answer (Photon forgives typos, « Fonds » for « Fond »). |
| `GEOCODER_FALLBACK_URL` | Optional: another Photon server. |
| `BUILDINGS_PROVIDER` | `overpass` (default) or `none`: OpenStreetMap building footprints, as volumes in the 3D view. |
| `OVERPASS_URL` | Optional: another Overpass server (default: the public instance, responses cached for a month). |
| `MAP_RELAY_EXTRA_HOSTS` | Optional: layer servers other than `geoservices.wallonie.be`. |

### Plant catalogue

| Variable | Role |
|---|---|
| `TERRANOVA_API_URL` | Default `https://app.semisto.org/api/v1`. |
| `TERRANOVA_API_TOKEN` | Token of an account of Semisto's internal Terranova app that can read `/plant/*`. |

Used only by the one-off command `bin/rails catalog:import_terranova` (genera, species and varieties, values only, never free text or personal data).

### Plant identification (Pl@ntNet)

| Variable | Role |
|---|---|
| `PLANTNET_API_KEY` | Optional. Turns on « Identifier l'espèce par photo » in a map plant's sheet. Key created at https://my.plantnet.org. Without it, the button is greyed out and the interface explains why. |
| `PLANTNET_API_URL` | Optional: another API address (default `https://my-api.plantnet.org`). |

One to five photos of the same plant go to Pl@ntNet, which answers with likely species; the editor chooses, nothing is saved without their choice, and Terranova does not keep the photos. The interface shows « Identification : Pl@ntNet ». **Before turning the feature on for a paid service, check Pl@ntNet's terms of use** (commercial use, identification quota, source attribution): the free tier is limited.

### Photo rendering (Magnific)

| Variable | Role |
|---|---|
| `MAGNIFIC_API_KEY` | Optional. Turns on « Mettre en image » in the photo viewer (a photo and its sketch painted as a photo, a watercolour or a pencil drawing). API key of Semisto's Magnific account (https://www.magnific.com/user/organization/api-keys). Without it, the button is greyed out and the interface explains why. |
| `MAGNIFIC_API_URL` | Optional: another API address (default `https://api.magnific.com`). |

Each image is paid for in credits of the Magnific account (Nano Banana Pro model, about 75 to 100 credits). A map's owner is entitled to 30 images a month across all their maps (`PhotoRendering::MONTHLY_LIMIT`), with a paid plan (or as long as Stripe is not configured). Magnific downloads the sketched photo through a signed link valid for one hour: `APP_HOST` must be the server's public address.

### Store review of the mobile app

| Variable | Role |
|---|---|
| `APP_REVIEW_EMAIL` | Optional. Address of the account Apple's and Google's reviewers use. |
| `APP_REVIEW_CODE` | Optional, at least 16 characters. With `APP_REVIEW_EMAIL`, the sign-in page shows « Accès pour la relecture des stores » (address + code, no magic link). Without both, the access does not exist. |

Once they are set, `bin/rails app_review:prepare` gives that account a demo map (or `MAP_ID=… bin/rails app_review:prepare` makes it an editor of an existing map). Remove the variables once the review is over if you want to close the access.

### Claudy import (Les 4 Sources)

| Variable | Role |
|---|---|
| `CLAUDY_API_URL` | Default `https://app.les4sources.be/api/v1` (`/api/v1` is appended if missing). |
| `CLAUDY_API_KEY` | One of Claudy's `AGENT_API_TOKEN` tokens (read-only). |
| `CLAUDY_NETWORK_LAYERS` | Optional: the network of a layer the API cannot identify, for example `7=ethernet`. |

Used only by the one-off command `bin/rails claudy:import MAP_ID=…`, which pours the plan of Claudy's map into a Terranova map. Without a key, give it a Claudy export (`FILE=…`). It can be run again with no risk of duplicates. How-to: `docs/import-claudy.md`.

### Climate and weather

| Variable | Role |
|---|---|
| `OPEN_METEO_API_KEY` | Weather forecasts (paid "API Standard" plan). Without it: « bientôt disponibles ». The code refuses Open-Meteo's free APIs (non-commercial use only). |
| `OPEN_METEO_URL` | Optional: a self-hosted instance. |
| `CLIMATE_NORMALS_PROVIDER`, `CLIMATE_PROJECTIONS_PROVIDER`, `CLIMATE_FORECAST_PROVIDER` | Optional: `static`, `open_meteo` or `none`. |

### Error tracking

| Variable | Role |
|---|---|
| `SENTRY_DSN` | Optional: sends errors to Sentry, both the server's (Rails) and the browser's (React). The DSN is read at boot and passed to the page: nothing to set at build time. |
| `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | Optional. |

### Audience measurement

| Variable | Role |
|---|---|
| `PLAUSIBLE_DOMAIN` | Optional: the site's name in Plausible (`terranova.semisto.org`). Adds the script of Semisto's own Plausible instance: no cookie, no personal data. Without it, nothing is measured. |
| `PLAUSIBLE_SCRIPT_URL` | Optional: the script URL, `https://stats.semisto.org/js/script.js` by default. |

## Outbound connections

The server must be able to reach: `geoservices.wallonie.be` (layers, identification, relief), `tiles.openfreemap.org` and `tile.openstreetmap.org` (base map), `nominatim.openstreetmap.org` (addresses), `my-api.plantnet.org` (plant identification by photo, if `PLANTNET_API_KEY` is set), `api.magnific.com` and Magnific's image server (photo rendering, if `MAGNIFIC_API_KEY` is set), `api.stripe.com`, `appleid.apple.com` (Sign in with Apple, if `APPLE_CLIENT_ID` is set), the SMTP server, the S3 provider and, if set, Sentry and Open-Meteo. The one-off Claudy import reaches `app.les4sources.be`.

## Claude (MCP)

No variable. Address to give users: `https://terranova.semisto.org/mcp` (Claude → Settings → Connectors → Add custom connector). Guide in the application: `/account/ai`; public documentation: `/docs/mcp`.

## Drone views

### Views imported by users

Any editor of a map imports their own orthophoto from **Couches → Vues drone → Importer une vue drone**: georeferenced GeoTIFF, `.mbtiles` or `.pmtiles`, up to 10 GB (`AerialView::MAX_UPLOAD_BYTES`). The browser sends the file in 32 MB chunks (under Cloudflare's 100 MB limit) to file storage; a background job (`AerialViewImportJob`, one at a time on the server) converts it into a PMTiles archive (WebP tiles) attached to the view, then deletes the original. The view is served by the application (`/maps/:id/aerial_views/:id/archive`, `Range` requests), so no CORS setting is needed at the host.

- **Tools in the image**: `gdal-bin` (Debian package) and `pmtiles` (go-pmtiles, built in a `Dockerfile` stage). Without them, the import fails with « conversion impossible ».
- **Working disk**: `AERIAL_WORK_DIR` (default `tmp/aerial` in the application). The conversion writes the original, the tiles and the archive there: plan for about **3 times the size of the largest file** (30 GB for 10 GB). On Coolify, point this variable to a volume with that much room (for example under `/rails/storage`); the folder is emptied at the end of each conversion, successful or not.
- **Duration**: a few minutes for 1 GB, one to two hours for several GB. Each conversion step is stopped after 4 hours.
- An abandoned upload is cleaned up after 3 days (`McpUploadPurgeJob`): the view fails with « envoi expiré ».

### Views placed by Semisto (drone mission)

No variable. After a drone mission (paid order: a « Mission drone commandée » e-mail arrives at `SEMISTO_CONTACT_EMAIL`), the team places the view on one of the customer's maps from **Demandes → Vues drone** (`/admin/drone-views`, `admin` accounts only). The customer then receives the « Votre vue drone est sur votre carte » e-mail. Tiles do not go through the server: the browser reads them straight from the host.

1. **Produce the orthophoto.** Stitch the flight's photos in OpenDroneMap / WebODM and export the orthomosaic as a GeoTIFF (`odm_orthophoto.tif`). Note the flight date.
2. **Cut it into tiles**, either way:
   - **PMTiles** (recommended: a single file, zooms and extent read from the archive):
     ```sh
     gdalwarp -t_srs EPSG:3857 -r bilinear odm_orthophoto.tif ortho_3857.tif
     gdal_translate -of MBTILES -co TILE_FORMAT=PNG ortho_3857.tif view.mbtiles   # WEBP if your GDAL allows it: lighter
     gdaladdo -r average view.mbtiles 2 4 8 16 32 64
     pmtiles convert view.mbtiles terrain-2027-05-12.pmtiles
     pmtiles show terrain-2027-05-12.pmtiles   # zooms, extent, tile type (raster)
     ```
     (`pmtiles` is Protomaps' command-line tool; `rio pmtiles` does the same in one step from the GeoTIFF.)
   - **XYZ tiles**: `gdal2tiles.py --xyz -z 14-22 -w none odm_orthophoto.tif tiles/`, then upload the folder. The address is `https://…/tiles/{z}/{x}/{y}.png`; enter the highest zoom produced in « Zoom maximum ».
   - PNG keeps what lies outside the flight transparent; JPEG would paint it black.
3. **Host** it on an S3-compatible bucket, over **https**, publicly readable object by object (without listing the bucket). The bucket's CORS rule:
   ```json
   [{
     "AllowedOrigins": ["https://terranova.semisto.org"],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["Range"],
     "ExposeHeaders": ["ETag", "Content-Range", "Content-Length"],
     "MaxAgeSeconds": 86400
   }]
   ```
   A PMTiles archive is read through `Range` requests: without this rule, the view stays empty and the editor shows « Cette vue drone ne répond pas ». Replacing a file under the same name works (the ETag changes), but a new name per flight keeps the history clean.
4. **Paste the address** in the Vues drone screen, on the buyer's map: flight date, format, address, optional credit (« Vue drone © Semisto » by default). To check a file before telling the customer, place it first on a Semisto map (the « par son numéro » form, no e-mail), open it, remove it, then place it on the order. A second flight is added next to the first: views do not replace each other, and the customer compares the dates in **Couches → Vues drone**.

No content security policy (CSP) is active (`config/initializers/content_security_policy.rb` is commented out). If one is turned on, allow the tile host in `connect-src` and `img-src` (and `blob:`), otherwise drone views stop loading.

## To check before the public opening

- A full Stripe test in test mode: individual pass with a promotion code, subscription, refund, drone mission.
- A real drone view (PMTiles) served by the production bucket, CORS included, on a computer and on a phone.
- A drone view import of several GB in production, to check the room on `AERIAL_WORK_DIR` and the conversion time.
- A real relief import and the Géoportail layers from the server (layer ids, zooms, the cadastre's CAPAKEY field).
- The licence of the SPW data for a caching tile relay.
- The indicative values written without access to the sources: Wallonia's climate normals and projections, soil analysis ranges, planning rules (CoDT), starter catalogue (106 species « à vérifier »), bioindicator plants.
- Pl@ntNet's terms of use for a paid service, before setting `PLANTNET_API_KEY`.
- The privacy and terms pages, drafts marked « Projet — à valider ».
