Rails.application.routes.draw do
  # Sign-in: Google or magic link, no passwords.
  resource :session, only: %i[new create destroy]
  get "magic/:token", to: "magic_links#show", as: :magic_link
  get "auth/google_oauth2/callback", to: "omniauth_callbacks#google"
  get "auth/failure", to: "omniauth_callbacks#failure"
  get "dev/login", to: "dev/logins#show" if Rails.env.local?

  resources :maps do
    scope module: :maps do
      resources :features, only: %i[index create update destroy]
    end
  end

  # --- billing-site ---
  # Public website (server-side meta tags, French URLs).
  get "fonctionnalites", to: "pages#features", as: :features_page
  get "tarifs", to: "pages#pricing", as: :pricing
  get "mission-drone", to: "pages#drone", as: :drone_mission
  get "open-source", to: "pages#open_source", as: :open_source
  get "confidentialite", to: "pages#privacy", as: :privacy
  get "conditions", to: "pages#terms", as: :terms
  get "sitemap", to: "pages#sitemap", defaults: { format: "xml" }, as: :sitemap
  # Help center (Markdown articles in app/help); /help/:slug.json feeds the help drawer.
  get "help", to: "help#index", as: :help_center
  get "help/:slug", to: "help#show", as: :help_article, constraints: { slug: /[a-z0-9-]+/ }
  # Plans and payments (Stripe) and the account page.
  get "billing", to: "billing#show", as: :billing
  post "billing/checkout", to: "billing_checkouts#create", as: :billing_checkout
  post "billing/portal", to: "billing_portals#create", as: :billing_portal
  resource :account, only: %i[show update]
  post "account/deletion_request", to: "accounts#deletion_request", as: :account_deletion_request
  post "webhooks/stripe", to: "webhooks/stripe#create"
  # --- end billing-site ---

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "pages#home"
end
