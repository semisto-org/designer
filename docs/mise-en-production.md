# Mise en production

Référence des réglages de Semisto Designer en production (https://designer.semisto.org). Chaque variable ci-dessous est lue par le code ; une variable absente désactive proprement la fonction concernée (l'interface le dit au lieu d'échouer).

## Hébergement

- Image : `Dockerfile` à la racine. Au démarrage, `bin/docker-entrypoint` lance `bin/rails db:prepare` puis `bin/rails db:seed` (idempotent : régions, couches du Géoportail, catalogue de départ, données climatiques, règles indicatives).
- Port 80 (Thruster devant Puma). Contrôle de santé : `GET /up`.
- PostgreSQL 16 **avec PostGIS** (image conseillée : `postgis/postgis:16-3.4`). L'utilisateur doit pouvoir créer des bases et les extensions `postgis`, `citext` et `unaccent` (ou un administrateur les crée à l'avance).
- Quatre bases sont créées à partir de `DATABASE_URL` : la principale, puis `_cache`, `_queue` et `_cable`.
- Fichiers (photos, PDF de labo, relief importé) : un stockage S3 dès que `S3_BUCKET` est défini, sinon le disque local `/rails/storage`, qu'il faut alors monter sur un **volume persistant** (sinon tout disparaît au déploiement suivant). Un volume Docker nommé convient tel quel ; un dossier de l'hôte doit appartenir à l'utilisateur de l'image (`chown -R 1000:1000 <dossier>`), sinon les envois échouent.
- DNS : `designer.semisto.org` → enregistrement A/AAAA vers le VPS ; le certificat TLS est géré par le proxy du VPS.
- Déploiement automatique : `.github/workflows/deploy.yml` demande un déploiement à l'API de Coolify après chaque CI verte sur `main` (ou à la main, onglet Actions). Dans GitHub (Réglages, Secrets and variables, Actions) : le secret `COOLIFY_TOKEN` (jeton d'API Coolify avec la permission « deploy ») et la variable `COOLIFY_APP_UUID` (identifiant de l'application `designer`, visible dans son adresse sur Coolify) ; `COOLIFY_URL` est facultative (défaut `https://dash.semisto.org`). Sans ces réglages, le workflow ne fait rien.

## Variables d'environnement

### Obligatoires

| Variable | Rôle |
|---|---|
| `SECRET_KEY_BASE` | Clé de chiffrement des sessions (`bin/rails secret`). |
| `DATABASE_URL` | `postgres://utilisateur:motdepasse@hôte:5432/designer_production` (`postgis://` accepté). Le nom de la base est obligatoire : les trois autres en dérivent. |
| `APP_HOST` | `designer.semisto.org` (liens des e-mails, OAuth, plan du site). C'est aussi le seul nom d'hôte accepté : tout autre domaine reçoit une erreur 403, sauf `/up`. |
| `MAIL_FROM` | Expéditeur, par ex. `Semisto Designer <designer@semisto.org>`. |
| `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | Envoi des e-mails : connexion par lien magique, invitations, commentaires, demandes. Sans eux, l'écran annonce « lien envoyé » mais la tâche d'envoi échoue (visible dans les journaux et Sentry) : personne ne peut se connecter par e-mail. |
| `SOLID_QUEUE_IN_PUMA` | Facultative. Par défaut en production, les tâches de fond (e-mails, import de relief, rappels de renouvellement) tournent dans le serveur web, sur une seule machine. `false` les coupe, pour les confier à un processus `bin/jobs` séparé. |

### Connexion Google

| Variable | Rôle |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Identifiants OAuth « Application Web ». |

Dans la console Google Cloud : origine autorisée `https://designer.semisto.org`, URI de redirection `https://designer.semisto.org/auth/google_oauth2/callback`, portées `email` et `profile`. Sans ces variables, seul le lien magique par e-mail est proposé.

### Paiements (Stripe, compte Marco & Vespucci)

| Variable | Rôle |
|---|---|
| `STRIPE_SECRET_KEY` | Active la facturation. Sans elle, tout est débloqué (bêta). |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook `https://designer.semisto.org/webhooks/stripe`. |
| `STRIPE_PRICE_YEARLY` | Forfait particulier, paiement unique 79 € TVAC. |
| `STRIPE_PRICE_ATELIER` | Atelier, abonnement mensuel 49 € TVAC. |
| `STRIPE_PRICE_BUREAU` | Bureau d'études, abonnement mensuel 99 € TVAC. |
| `STRIPE_PRICE_DRONE` | Mission drone, paiement unique 280 € TVAC. |
| `STRIPE_PORTAL_CONFIGURATION` | Facultatif : configuration du portail client. |
| `BILLING_DISABLED` | Facultatif : `true` coupe la facturation même avec une clé. |

Événements du webhook : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Prix en EUR, taxe « inclusive », Stripe Tax activé. Réduction membres : un coupon de 30 % limité au Forfait particulier, puis un code promo par membre.

### Paiement sur facture (communes)

Les communes, écoles, associations et entreprises qui ne peuvent pas payer par carte demandent une facture depuis **Formule et facturation** ou la page **Tarifs** (« Payer sur facture », `/billing/invoice`) : nom et adresse de l'organisation, numéro de TVA ou d'entreprise, e-mail de facturation, numéro de bon de commande, formule pour un an (Atelier 12 × 49 €, Bureau d'études 12 × 99 €, Forfait particulier 79 €, TVA comprise).

1. La demande arrive par e-mail à `SEMISTO_CONTACT_EMAIL` (répondre écrit au demandeur) et dans l'écran **Demandes de facture** (`/admin/invoice-requests`, lien en tête de `/admin/requests`), réservé aux administrateurs. Donner ce rôle : `bin/rails users:admin EMAIL=prenom@semisto.org` (la personne doit s'être connectée une fois ; `users:unadmin` le retire, `users:admins` liste les administrateurs).
2. **Avec Stripe** : « Créer la facture dans Stripe » crée un client Stripe propre à l'organisation (repris pour un renouvellement de la même organisation, jamais le client personnel de l'utilisateur), ajoute le numéro de TVA intracommunautaire s'il en a la forme (BE0123456789), puis envoie par e-mail une facture TVA comprise (Stripe Tax), payable sous 30 jours, avec le **numéro de bon de commande** en champ personnalisé. Le paiement est enregistré par le webhook `invoice.paid` dans le registre des paiements (`bin/rails billing:payments`), la demande passe à « Payée » et la formule démarre si elle ne l'était pas. Dans les réglages Stripe (Facturation → Factures), activer le virement bancaire comme moyen de paiement des factures.
3. **Sans Stripe** : la facture se fait à la main (montant TVA comprise, numéro de bon de commande) ; l'écran le rappelle.
4. « Activer la formule » la démarre pour 12 mois à partir de la date choisie (par défaut aujourd'hui, ou la fin de la formule en cours pour un renouvellement), sans attendre le paiement ; l'utilisateur est prévenu par e-mail. « Marquer comme payée » (marque aussi la facture Stripe « payée hors Stripe » si besoin) et « Annuler » (annule la facture Stripe ; une formule déjà démarrée s'arrête) complètent le suivi.

À l'échéance, rien n'est supprimé : comme pour le forfait, les cartes au-delà de la formule gratuite passent en lecture seule, et les rappels partent 30 jours avant, 7 jours avant et le jour même.

### Fichiers (S3 compatible)

| Variable | Rôle |
|---|---|
| `S3_BUCKET` | Active le stockage objet (par ex. `designer-media`). |
| `S3_ENDPOINT` | Par ex. `https://fsn1.your-objectstorage.com` (Hetzner) ou `https://s3.fr-par.scw.cloud` (Scaleway). |
| `S3_REGION` | Par ex. `fsn1`, `fr-par`. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Clé limitée à ce seau. |
| `S3_FORCE_PATH_STYLE` | `true` par défaut. |
| `ACTIVE_STORAGE_SERVICE` | Facultatif : force `local` ou `object_storage`. |

Les fichiers ne sont jamais publics : l'application vérifie le rôle sur la carte puis redirige vers une URL signée de cinq minutes.

### Contacts de Semisto

| Variable | Rôle |
|---|---|
| `SEMISTO_CONTACT_EMAIL` | Affiché sur le site ; reçoit les commandes de mission drone, les demandes de paiement sur facture et les demandes de suppression de compte (défaut `designer@semisto.org`). |
| `SEMISTO_REQUESTS_EMAIL` | Reçoit les demandes « Passer à l'action » : commande de plants, réalisation, co-gestion (plusieurs adresses séparées par des virgules ; défaut `designer@semisto.org`). |

### Carte et adresses

| Variable | Rôle |
|---|---|
| `GEOCODER_PROVIDER` | `nominatim` (défaut), `photon` ou `none`. |
| `GEOCODER_URL` | Facultatif : autre serveur. |
| `GEOCODER_USER_AGENT_EMAIL` | Adresse de contact exigée par la règle d'usage de Nominatim. |
| `GEOCODER_FALLBACK` | `photon` (défaut avec Nominatim) ou `none` : interrogé quand Nominatim ne trouve rien ou ne répond pas (Photon tolère les fautes, « Fonds » pour « Fond »). |
| `GEOCODER_FALLBACK_URL` | Facultatif : autre serveur Photon. |
| `MAP_RELAY_EXTRA_HOSTS` | Facultatif : autres serveurs de couches que `geoservices.wallonie.be`. |

### Catalogue de plantes

| Variable | Rôle |
|---|---|
| `TERRANOVA_API_URL` | Défaut `https://app.semisto.org/api/v1`. |
| `TERRANOVA_API_TOKEN` | Jeton d'un compte Terranova qui lit `/plant/*`. |

Utilisées seulement par la commande ponctuelle `bin/rails catalog:import_terranova` (genres, espèces et variétés, valeurs seulement, jamais de texte libre ni de donnée personnelle).

### Identification des plantes (Pl@ntNet)

| Variable | Rôle |
|---|---|
| `PLANTNET_API_KEY` | Facultatif. Active « Identifier l'espèce par photo » dans la fiche d'une plante de la carte. Clé créée sur https://my.plantnet.org. Sans elle, le bouton est grisé et l'interface explique pourquoi. |
| `PLANTNET_API_URL` | Facultatif : autre adresse de l'API (défaut `https://my-api.plantnet.org`). |

Une à cinq photos d'une même plante partent chez Pl@ntNet, qui répond des espèces probables ; l'éditeur choisit, rien n'est enregistré sans son choix et Designer ne conserve pas les photos. L'interface affiche « Identification : Pl@ntNet ». **Avant d'activer la fonction sur un service payant, vérifiez les conditions d'utilisation de Pl@ntNet** (usage commercial, quota d'identifications, mention de la source) : l'offre gratuite est limitée.

### Import de Claudy (Les 4 Sources)

| Variable | Rôle |
|---|---|
| `CLAUDY_API_URL` | Défaut `https://app.les4sources.be/api/v1` (`/api/v1` est ajouté s'il manque). |
| `CLAUDY_API_KEY` | Un des jetons `AGENT_API_TOKEN` de Claudy (lecture seule). |
| `CLAUDY_NETWORK_LAYERS` | Facultatif : réseau d'une couche que l'API ne permet pas de reconnaître, par exemple `7=ethernet`. |

Utilisées seulement par la commande ponctuelle `bin/rails claudy:import MAP_ID=…`, qui verse le plan de la carte de Claudy dans une carte de Designer. Sans clé, on lui donne un export de Claudy (`FILE=…`). Elle peut être relancée sans risque de doublon. Mode d'emploi : `docs/import-claudy.md`.

### Climat et météo

| Variable | Rôle |
|---|---|
| `OPEN_METEO_API_KEY` | Prévisions météo (offre payante « API Standard »). Sans elle : « bientôt disponibles ». Les API gratuites d'Open-Meteo sont refusées par le code (usage non commercial). |
| `OPEN_METEO_URL` | Facultatif : instance auto-hébergée. |
| `CLIMATE_NORMALS_PROVIDER`, `CLIMATE_PROJECTIONS_PROVIDER`, `CLIMATE_FORECAST_PROVIDER` | Facultatif : `static`, `open_meteo` ou `none`. |

### Suivi des erreurs

| Variable | Rôle |
|---|---|
| `SENTRY_DSN` | Facultatif : envoie les erreurs à Sentry, celles du serveur (Rails) et celles du navigateur (React). Le DSN est lu au démarrage et transmis à la page : rien à définir au moment du build. |
| `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | Facultatifs. |

## Connexions sortantes

Le serveur doit pouvoir joindre : `geoservices.wallonie.be` (couches, identification, relief), `tiles.openfreemap.org` et `tile.openstreetmap.org` (fond de plan), `nominatim.openstreetmap.org` (adresses), `my-api.plantnet.org` (identification des plantes par photo, si `PLANTNET_API_KEY` est défini), `api.stripe.com`, le serveur SMTP, le fournisseur S3 et, si défini, Sentry et Open-Meteo. L'import ponctuel de Claudy joint `app.les4sources.be`.

## Claude (MCP)

Aucune variable. Adresse à donner aux utilisateurs : `https://designer.semisto.org/mcp` (Claude → Paramètres → Connecteurs → Ajouter un connecteur personnalisé). Guide dans l'application : `/account/ai` ; documentation publique : `/docs/mcp`.

## Vues drone

Aucune variable. Après une mission drone (commande payée : un e-mail « Mission drone commandée » arrive à `SEMISTO_CONTACT_EMAIL`), l'équipe pose la vue sur une carte du client depuis **Demandes → Vues drone** (`/admin/drone-views`, comptes `admin` seulement). Le client reçoit alors l'e-mail « Votre vue drone est sur votre carte ». Les tuiles ne passent pas par le serveur : le navigateur les lit directement chez l'hébergeur.

1. **Produire l'orthophoto.** Assembler les photos du vol dans OpenDroneMap / WebODM et exporter l'orthomosaïque en GeoTIFF (`odm_orthophoto.tif`). Noter la date du vol.
2. **La découper en tuiles**, au choix :
   - **PMTiles** (conseillé : un seul fichier, zooms et emprise lus dans l'archive) :
     ```sh
     gdalwarp -t_srs EPSG:3857 -r bilinear odm_orthophoto.tif ortho_3857.tif
     gdal_translate -of MBTILES -co TILE_FORMAT=PNG ortho_3857.tif vue.mbtiles   # WEBP si votre GDAL le permet : plus léger
     gdaladdo -r average vue.mbtiles 2 4 8 16 32 64
     pmtiles convert vue.mbtiles terrain-2027-05-12.pmtiles
     pmtiles show terrain-2027-05-12.pmtiles   # zooms, emprise, type de tuiles (raster)
     ```
     (`pmtiles` est l'outil en ligne de commande de Protomaps ; `rio pmtiles` fait la même chose en une étape depuis le GeoTIFF.)
   - **Tuiles XYZ** : `gdal2tiles.py --xyz -z 14-22 -w none odm_orthophoto.tif tuiles/`, puis envoyer le dossier. L'adresse est `https://…/tuiles/{z}/{x}/{y}.png` ; indiquer le zoom le plus fort produit dans « Zoom maximum ».
   - Le PNG garde transparent ce qui est hors du vol ; un JPEG le peindrait en noir.
3. **Héberger** sur un bucket compatible S3, en **https**, lisible publiquement objet par objet (sans lister le bucket). Règle CORS du bucket :
   ```json
   [{
     "AllowedOrigins": ["https://designer.semisto.org"],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["Range"],
     "ExposeHeaders": ["ETag", "Content-Range", "Content-Length"],
     "MaxAgeSeconds": 86400
   }]
   ```
   Une archive PMTiles est lue par requêtes `Range` : sans cette règle, la vue reste vide et l'éditeur affiche « Cette vue drone ne répond pas ». Remplacer un fichier en gardant son nom est possible (l'ETag change), mais un nouveau nom par vol garde l'historique propre.
4. **Coller l'adresse** dans l'écran Vues drone, sur la carte de l'acheteur : date du vol, format, adresse, mention facultative (par défaut « Vue drone © Semisto »). Pour contrôler un fichier avant de prévenir le client, le poser d'abord sur une carte de Semisto (formulaire « par son numéro », aucun e-mail), l'ouvrir, le retirer, puis le poser sur la commande. Un second vol s'ajoute à côté du premier : les vues ne se remplacent pas, le client compare les dates dans **Couches → Vues drone**.

Aucune politique de sécurité du contenu (CSP) n'est active (`config/initializers/content_security_policy.rb` est commenté). Si on en active une, autoriser l'hôte des tuiles dans `connect-src` et `img-src` (et `blob:`), sinon les vues drone ne se chargent plus.

## À vérifier avant l'ouverture publique

- Un essai complet de Stripe en mode test : forfait avec code promo, abonnement, remboursement, mission drone.
- Une vraie vue drone (PMTiles) servie par le bucket de production, CORS compris, sur ordinateur et sur téléphone.
- Un import de relief réel et les couches du Géoportail depuis le serveur (identifiants de couches, zooms, champ CAPAKEY du cadastre).
- La licence des données du SPW pour un relais de tuiles avec cache.
- Les valeurs indicatives écrites sans accès aux sources : normales et projections climatiques de Wallonie, fourchettes d'analyse de sol, règles d'urbanisme (CoDT), catalogue de départ (106 espèces « à vérifier »), plantes bio-indicatrices.
- Les conditions d'utilisation de Pl@ntNet pour un service payant, avant de définir `PLANTNET_API_KEY`.
- Les pages Confidentialité et Conditions, brouillons marqués « Projet — à valider ».
