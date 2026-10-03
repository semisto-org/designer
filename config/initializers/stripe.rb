# Stripe is optional (billing is disabled without STRIPE_SECRET_KEY). Calls go
# through Providers::StripeGateway, which builds a client per request key.
Stripe.open_timeout = 5
Stripe.read_timeout = 20
Stripe.max_network_retries = 2
Stripe.set_app_info("Semisto Designer", url: "https://designer.semisto.org")
