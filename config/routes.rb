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

  # --- collab ---
  # Joining from a link: e-mail invitation or the map's share link.
  get "invitations/:token", to: "invitations#show", as: :invitation
  get "join/:token", to: "joins#show", as: :join
  resource :comment_preference, only: :update

  resources :maps, only: [] do
    scope module: :maps do
      resource :sharing, only: :show
      resources :memberships, only: %i[update destroy]
      resources :invitations, only: %i[create destroy] do
        post :resend, on: :member
      end
      resource :share_link, only: %i[create update destroy] do
        post :reset
      end
      resources :comments, only: %i[index create update destroy] do
        collection do
          get :threads
          post :subscribe, to: "comment_subscriptions#create"
          delete :subscribe, to: "comment_subscriptions#destroy"
        end
        resource :applause, only: %i[create destroy], controller: "comments/applauses"
      end
      resource :publication, only: %i[show create update destroy] do
        post :renew
      end
    end
  end

  # Public, account-free view of a published map (snapshot) and its tiles.
  constraints token: MapPublication::TOKEN_PATTERN do
    get "p/:token", to: "public_maps#show", as: :public_map
    get "p/:token/tiles/:layer_key/:z/:x/:y", to: "public_maps/tiles#show", as: :public_map_tile
  end
  # --- end collab ---
  # --- journey ---
  # Project sheet, journey checklists and requests sent to Semisto from a map;
  # staff triage of those requests.
  resources :maps, only: [] do
    resource :project, only: %i[show update], controller: "maps/projects"
    resource :journey, only: :show, controller: "maps/journeys"
    resources :service_requests, path: "requests", only: %i[index create], controller: "maps/service_requests"
  end
  namespace :admin do
    resources :requests, only: %i[index update], controller: "service_requests"
  end
  # --- end journey ---
  # --- map-data ---
  # Tile relay with cache (public, narrow: see RegionLayerTilesController).
  get "regions/:region_id/layers/:key/tiles/:z/:x/:y", to: "region_layer_tiles#show", as: :region_layer_tile,
    constraints: { z: /\d+/, x: /\d+/, y: /\d+/, key: /[a-z0-9_]+/ }, format: false
  get "geocode", to: "geocoding#index", as: :geocode
  resources :maps, only: [] do
    scope module: :maps do
      get "identify", to: "identify#show", as: :identify
      get "parcels/lookup", to: "parcels#lookup", as: :parcel_lookup
      post "parcels", to: "parcels#create", as: :parcels
      post "boundary_import", to: "boundary_imports#create", as: :boundary_import
    end
  end
  # --- end map-data ---
  # --- mcp ---
  # Remote MCP server (Streamable HTTP, stateless) and its OAuth 2.1
  # authorization server, for Claude and other agents.
  post "mcp", to: "mcp#create", as: :mcp
  match "mcp", to: "mcp#method_not_allowed", via: %i[get delete]
  match "mcp", to: "mcp#preflight", via: :options
  get ".well-known/oauth-authorization-server", to: "oauth/metadata#authorization_server", as: :oauth_authorization_server_metadata
  get ".well-known/oauth-protected-resource", to: "oauth/metadata#protected_resource", as: :oauth_protected_resource_metadata
  get ".well-known/oauth-protected-resource/mcp", to: "oauth/metadata#protected_resource"
  match ".well-known/*path", to: "oauth/metadata#preflight", via: :options
  namespace :oauth do
    post "register", to: "registrations#create"
    get "authorize", to: "authorizations#new"
    post "authorize", to: "authorizations#create"
    post "token", to: "tokens#create"
    post "revoke", to: "revocations#create"
    match "register", to: "registrations#preflight", via: :options
    match "token", to: "tokens#preflight", via: :options
    match "revoke", to: "revocations#preflight", via: :options
  end
  namespace :account do
    get "ai", to: "ai#show"
    resources :api_tokens, path: "ai/tokens", only: %i[create destroy]
    resources :oauth_apps, path: "ai/apps", only: :destroy
  end
  resources :maps, only: [] do
    scope module: :maps do
      resources :drafts, only: :index do
        member do
          post :accept
          post :reject
        end
        collection do
          post :accept_all
          post :reject_all
        end
      end
      resources :ai_actions, only: :index
    end
  end
  get "docs/mcp", to: "docs#mcp", as: :mcp_docs
  # --- end mcp ---
  # --- relief-water ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :relief, only: :show do
        get "files/:kind", action: :file, as: :file, constraints: { kind: /grid|surface|landcover|texture/ }
      end
      resource :terrain, only: %i[show create]
      resource :water_settings, only: :update
    end
  end
  # --- end relief-water ---
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
  # --- plants ---
  resources :plants, only: %i[index show]
  resources :maps, only: [] do
    scope module: :maps do
      resource :planting, only: :show
      resources :palette_items, only: %i[index create update destroy] do
        collection { get :suggestions }
      end
      resources :features, only: [] do
        resources :patch_items, only: %i[index create update destroy]
        resources :plant_observations, only: %i[index create destroy]
      end
      resource :plant_list, only: :show do
        get :print
      end
    end
  end
  # --- end plants ---
  # --- climate-finance ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :climate, only: :show do
        get :forecast
      end
      resource :finances, only: %i[show update] do
        post :sync
      end
    end
  end
  # --- end climate-finance ---
  # --- soil-photos ---
  resources :maps, only: [] do
    scope module: :maps do
      resources :photos, only: %i[index create update destroy] do
        member do
          get :image
          get :same_spot
        end
      end
      resources :photo_albums, only: %i[create update destroy]
      resources :soil_samples, only: %i[index create update destroy] do
        collection do
          post :suggestions
          post :bulk
        end
        resource :report, only: %i[show create destroy], controller: "soil_sample_reports"
      end
      resources :bioindicator_observations, only: %i[index create update destroy] do
        get :species, on: :collection
      end
    end
  end
  # --- end soil-photos ---
  # --- map-drawing ---
  scope "maps/:map_id", module: :maps, as: :map, constraints: { map_id: /\d+/ } do
    get "alerts", to: "alerts#index", as: :alerts, defaults: { format: :json }
    get "export.geojson", to: "exports#show", as: :geojson_export, format: false
  end
  # --- end map-drawing ---

  # --- teams ---
  # Teams ("équipes"): members edit every map of the team. The invitation
  # link comes first so "invitations" is never read as a team id.
  get "teams/invitations/:token", to: "team_invitations#show", as: :accept_team_invitation
  resources :teams, only: %i[index create show update destroy] do
    scope module: :teams do
      resources :memberships, only: %i[update destroy]
      resources :invitations, only: %i[create destroy] do
        post :resend, on: :member
      end
    end
  end
  resources :maps, only: [] do
    resource :team, only: :update, controller: "maps/teams"
  end
  # --- end teams ---

  # --- invoicing ---
  # « Payer sur facture »: the request form (signed in; from /billing and
  # /tarifs) and its confirmation, and the staff screen.
  get "billing/invoice", to: "invoice_requests#new", as: :new_invoice_request
  post "billing/invoice", to: "invoice_requests#create", as: :invoice_requests
  get "billing/invoice/:id", to: "invoice_requests#show", as: :invoice_request, constraints: { id: /\d+/ }
  namespace :admin do
    resources :invoice_requests, path: "invoice-requests", only: :index do
      member do
        post :invoice
        post :mark_paid, path: "mark-paid"
        post :cancel
        post :activate
      end
    end
  end
  # --- end invoicing ---

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "pages#home"
end
