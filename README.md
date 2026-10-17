# Semisto Terranova

Map your land accurately, then design your forest garden or permaculture plan with an AI that knows the place, its data and your goals.

A [Semisto](https://www.semisto.org) project, licensed under [AGPL-3.0](LICENSE). Hosted at [terranova.semisto.org](https://terranova.semisto.org).

## Development

Requirements: Ruby 3.3, Node 22, PostgreSQL 16 with PostGIS.

```sh
bundle install
npm install
bin/rails db:prepare db:seed
bin/dev            # Vite
bin/rails s        # Rails, on http://localhost:3000
```

In development, `/dev/login?email=you@example.org` signs you in without an e-mail.

Tests: `bin/rails test` and `npx tsc -p tsconfig.app.json`.

Why this project exists, its principles and what it refuses: [INTENT.md](INTENT.md). Code conventions are in [CLAUDE.md](CLAUDE.md). The interface is in French only for now; its copy lives in `config/locales/*.fr.yml` and the help articles in `app/help/`.

## Payments (Stripe)

Without `STRIPE_SECRET_KEY`, payments are off and everything is unlocked (closed beta). To turn them on, in Semisto ASBL's Stripe account:

1. **Products and prices** (EUR, tax behaviour "inclusive"): Forfait particulier (individual pass), one-off payment, €79 → `STRIPE_PRICE_YEARLY`; Atelier, monthly, €49 → `STRIPE_PRICE_ATELIER`; Bureau d'études, monthly, €99 → `STRIPE_PRICE_BUREAU`; Mission drone, one-off payment, €280 → `STRIPE_PRICE_DRONE`.
2. **Stripe Tax** enabled (Belgian and EU VAT registrations) and a tax code per product.
3. **Member discount**: a 30 % coupon restricted to the Forfait particulier, then one promotion code per member (entered by the member on the checkout page).
4. **Webhook** to `https://terranova.semisto.org/webhooks/stripe`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded` → `STRIPE_WEBHOOK_SECRET`.
5. **Customer portal** configured and enabled (cancel a subscription, payment method, invoices); optional: `STRIPE_PORTAL_CONFIGURATION`.
6. Customer receipts and invoice branding in the Stripe settings.

Municipalities, schools and companies can also **pay by invoice** (bank transfer, purchase order, admin screen `/admin/invoice-requests`, admins named with `bin/rails users:admin EMAIL=…`): see [Paying by invoice (municipalities)](docs/deployment.md#paying-by-invoice-municipalities).

Other variables: `SEMISTO_CONTACT_EMAIL` (address shown on the site and recipient of requests, `designer@semisto.org` by default). `bin/rails billing:payments` lists recorded payments (the basis of the revenue share with Semisto); `bin/rails billing:renewal_reminders` sends renewal reminders by hand (a recurring job does it every day in production).

## Deployment

Every environment variable, hosting, and the checklist before the public opening: [docs/deployment.md](docs/deployment.md).

## Licences

Code: AGPL-3.0. Code ported from [Claudy](https://github.com/les4sources/claudy) keeps its MIT notice (© Fondation Les 4 Sources).
