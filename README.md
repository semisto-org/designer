# Semisto Designer

Cartographiez votre terrain avec précision, puis concevez votre jardin-forêt ou votre design permaculturel avec une IA qui connaît le lieu, ses données et vos objectifs.

Un projet de [Semisto](https://www.semisto.org), sous licence [AGPL-3.0](LICENSE). Hébergé sur [designer.semisto.org](https://designer.semisto.org).

## Développer

Prérequis : Ruby 3.3, Node 22, PostgreSQL 16 avec PostGIS.

```sh
bundle install
npm install
bin/rails db:prepare db:seed
bin/dev            # Vite
bin/rails s        # Rails, sur http://localhost:3000
```

En développement, `/dev/login?email=vous@exemple.org` vous connecte sans e-mail.

Tests : `bin/rails test` et `npx tsc -p tsconfig.app.json`.

Pourquoi ce projet existe, ses principes et ce qu'il refuse : [INTENT.md](INTENT.md) (en anglais). Les conventions du code (en anglais) sont dans [CLAUDE.md](CLAUDE.md).

## Paiements (Stripe)

Sans `STRIPE_SECRET_KEY`, les paiements sont désactivés et tout est débloqué (bêta fermée). Pour les ouvrir, dans le compte Stripe de Marco & Vespucci :

1. **Produits et prix** (EUR, comportement fiscal « TVA incluse ») : Forfait particulier, paiement unique, 79 € → `STRIPE_PRICE_YEARLY` ; Atelier, mensuel, 49 € → `STRIPE_PRICE_ATELIER` ; Bureau d'études, mensuel, 99 € → `STRIPE_PRICE_BUREAU` ; Mission drone, paiement unique, 280 € → `STRIPE_PRICE_DRONE`.
2. **Stripe Tax** activé (enregistrements TVA belges et européens) et un code fiscal par produit.
3. **Réduction membres** : un coupon de 30 % limité au Forfait particulier, puis un code promotionnel individuel par membre (saisi par le membre sur la page de paiement).
4. **Webhook** vers `https://designer.semisto.org/webhooks/stripe`, événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded` → `STRIPE_WEBHOOK_SECRET`.
5. **Portail client** configuré et activé (annulation d'abonnement, moyen de paiement, factures) ; optionnel : `STRIPE_PORTAL_CONFIGURATION`.
6. Reçus clients et image de marque des factures dans les réglages Stripe.

Les communes, écoles et entreprises peuvent aussi **payer sur facture** (virement, bon de commande, écran d'administration `/admin/invoice-requests`, administrateurs nommés avec `bin/rails users:admin EMAIL=…`) : voir [Paiement sur facture (communes)](docs/mise-en-production.md#paiement-sur-facture-communes).

Autres variables : `SEMISTO_CONTACT_EMAIL` (adresse affichée sur le site et destinataire des demandes, `designer@semisto.org` par défaut). `bin/rails billing:payments` liste les paiements enregistrés (base du partage de revenus avec Semisto) ; `bin/rails billing:renewal_reminders` envoie les rappels d'échéance à la main (une tâche récurrente le fait chaque jour en production).

## Mise en production

Toutes les variables d'environnement, l'hébergement et la liste des vérifications avant l'ouverture : [docs/mise-en-production.md](docs/mise-en-production.md).

## Licences

Code : AGPL-3.0. Le code repris de [Claudy](https://github.com/les4sources/claudy) garde sa mention MIT (© Fondation Les 4 Sources).
