# Mise en production

Référence des réglages de Semisto Designer en production (https://designer.semisto.org). Chaque variable ci-dessous est lue par le code ; une variable absente désactive proprement la fonction concernée (l'interface le dit au lieu d'échouer).

## Hébergement

- Image : `Dockerfile` à la racine. Au démarrage, `bin/docker-entrypoint` lance `bin/rails db:prepare` puis `bin/rails db:seed` (idempotent : régions, couches du Géoportail, catalogue de départ, données climatiques, règles indicatives).
- Port 80 (Thruster devant Puma). Contrôle de santé : `GET /up`.
- PostgreSQL 16 **avec PostGIS** (image conseillée : `postgis/postgis:16-3.4`). L'utilisateur doit pouvoir créer des bases et les extensions `postgis`, `citext` et `unaccent` (ou un administrateur les crée à l'avance).
- Quatre bases sont créées à partir de `DATABASE_URL` : la principale, puis `_cache`, `_queue` et `_cable`.
- Fichiers (photos, PDF de labo, relief importé) : un stockage S3 dès que `S3_BUCKET` est défini, sinon le disque local `/rails/storage`, qu'il faut alors monter sur un **volume persistant**.
- DNS : `designer.semisto.org` → enregistrement A/AAAA vers le VPS ; le certificat TLS est géré par le proxy du VPS.

## Variables d'environnement

### Obligatoires

| Variable | Rôle |
|---|---|
| `SECRET_KEY_BASE` | Clé de chiffrement des sessions (`bin/rails secret`). |
| `DATABASE_URL` | `postgres://utilisateur:motdepasse@hôte:5432/designer_production`. |
| `APP_HOST` | `designer.semisto.org` (liens des e-mails, OAuth, plan du site). |
| `MAIL_FROM` | Expéditeur, par ex. `Semisto Designer <designer@semisto.org>`. |
| `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | Envoi des e-mails : connexion par lien magique, invitations, commentaires, demandes. |
| `SOLID_QUEUE_IN_PUMA` | `true` : les tâches de fond tournent dans le serveur web (une seule machine). |

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
| `SEMISTO_CONTACT_EMAIL` | Affiché sur le site ; reçoit les commandes de mission drone et les demandes de suppression de compte (défaut `designer@semisto.org`). |
| `SEMISTO_REQUESTS_EMAIL` | Reçoit les demandes « Passer à l'action » : commande de plants, réalisation, co-gestion (plusieurs adresses séparées par des virgules ; défaut `designer@semisto.org`). |

### Carte et adresses

| Variable | Rôle |
|---|---|
| `GEOCODER_PROVIDER` | `nominatim` (défaut), `photon` ou `none`. |
| `GEOCODER_URL` | Facultatif : autre serveur. |
| `GEOCODER_USER_AGENT_EMAIL` | Adresse de contact exigée par la règle d'usage de Nominatim. |
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
| `SENTRY_DSN` | Facultatif : envoie les erreurs à Sentry. |
| `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | Facultatifs. |

## Connexions sortantes

Le serveur doit pouvoir joindre : `geoservices.wallonie.be` (couches, identification, relief), `tiles.openfreemap.org` et `tile.openstreetmap.org` (fond de plan), `nominatim.openstreetmap.org` (adresses), `my-api.plantnet.org` (identification des plantes par photo, si `PLANTNET_API_KEY` est défini), `api.stripe.com`, le serveur SMTP, le fournisseur S3 et, si défini, Sentry et Open-Meteo. L'import ponctuel de Claudy joint `app.les4sources.be`.

## Claude (MCP)

Aucune variable. Adresse à donner aux utilisateurs : `https://designer.semisto.org/mcp` (Claude → Paramètres → Connecteurs → Ajouter un connecteur personnalisé). Guide dans l'application : `/account/ai` ; documentation publique : `/docs/mcp`.

## À vérifier avant l'ouverture publique

- Un essai complet de Stripe en mode test : forfait avec code promo, abonnement, remboursement, mission drone.
- Un import de relief réel et les couches du Géoportail depuis le serveur (identifiants de couches, zooms, champ CAPAKEY du cadastre).
- La licence des données du SPW pour un relais de tuiles avec cache.
- Les valeurs indicatives écrites sans accès aux sources : normales et projections climatiques de Wallonie, fourchettes d'analyse de sol, règles d'urbanisme (CoDT), catalogue de départ (92 espèces « à vérifier »), plantes bio-indicatrices.
- Les conditions d'utilisation de Pl@ntNet pour un service payant, avant de définir `PLANTNET_API_KEY`.
- Les pages Confidentialité et Conditions, brouillons marqués « Projet — à valider ».
