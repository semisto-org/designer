Rails.application.routes.draw do
  # Sign-in: Google, a magic link (or the code sent with it), or a password.
  resource :session, only: %i[new create destroy]
  post "session/code", to: "sessions#code", as: :session_code
  # « Changer de compte »: another account signed in on this browser.
  post "session/switch/:id", to: "sessions#switch", as: :switch_session
  post "session/password", to: "sessions#password", as: :session_password
  get "magic/:token", to: "magic_links#show", as: :magic_link
  post "magic/:token", to: "magic_links#create"
  get "auth/google_oauth2/callback", to: "omniauth_callbacks#google"
  post "auth/apple/return", to: "auth/apple_returns#create"
  post "auth/apple/callback", to: "omniauth_callbacks#apple"
  get "auth/failure", to: "omniauth_callbacks#failure"
  get "dev/login", to: "dev/logins#show" if Rails.env.local?

  # Cmd+J / Ctrl+J: the maps to jump to (QuickSwitcher).
  get "quick_switcher", to: "quick_switcher#index", as: :quick_switcher, defaults: { format: :json }
  get "quick_switcher/:id", to: "quick_switcher#show", as: :quick_switcher_map, defaults: { format: :json }

  resources :maps, except: :edit do
    scope module: :maps do
      resources :features, only: %i[index create update destroy] do
        post :restore, on: :member
      end
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
      # Archive (create) and bring back (destroy): the owner only.
      resource :archive, only: %i[create destroy]
      resources :memberships, only: %i[update destroy]
      resources :invitations, only: %i[create update destroy] do
        post :resend, on: :member
      end
      # The choices of the place's owners (« Le lieu »).
      resource :place_sharing, only: :update
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
        resource :preview, only: :create, controller: "publication_previews"
      end
    end
  end

  # Public, account-free view of a published map (snapshot) and its tiles.
  constraints token: MapPublication::TOKEN_PATTERN do
    get "p/:token", to: "public_maps#show", as: :public_map
    get "p/:token/tiles/:layer_key/:z/:x/:y", to: "public_maps/tiles#show", as: :public_map_tile
    get "p/:token/aerial-view", to: "public_maps/aerial_views#show", as: :public_map_aerial_view
    get "p/:token/preview.png", to: "public_maps/previews#show", as: :public_map_preview, format: false
    get "p/:token/3d", to: "public_maps/reliefs#show", as: :public_map_relief
    get "p/:token/3d/files/:kind", to: "public_maps/reliefs#file", as: :public_map_relief_file, constraints: { kind: /grid|surface|landcover|texture/ }
    get "p/:token/3d/buildings", to: "public_maps/reliefs#buildings", as: :public_map_relief_buildings
  end
  # « Et chez toi ? »: a map tried from an address, without an account.
  get "essai", to: "trials#new", as: :new_trial
  post "essai", to: "trials#create", as: :trials
  get "essai/geocode", to: "trials#geocode", as: :trials_geocode
  constraints token: /[A-Za-z0-9]{24,40}/ do
    get "essai/:token", to: "trials#show", as: :trial
    get "essai/:token/reading", to: "trials#reading", as: :trial_reading
    post "essai/:token/parcel", to: "trials#parcel", as: :trial_parcel
    post "essai/:token/keep", to: "trials#keep", as: :keep_trial
  end
  # --- end collab ---
  # --- journey ---
  # Project sheet, journey checklists and requests sent to Semisto from a map;
  # staff triage of those requests.
  resources :maps, only: [] do
    resource :project, only: %i[show update], controller: "maps/projects"
    resource :project_link, path: "project/link", only: %i[create destroy], controller: "maps/project_links" do
      post :reset
    end
    resources :project_drafts, path: "project/drafts", only: [], controller: "maps/project_drafts" do
      member do
        post :accept
        post :reject
      end
    end
    resource :journey, only: :show, controller: "maps/journeys"
    resources :service_requests, path: "requests", only: %i[index create], controller: "maps/service_requests"
  end
  # The project sheet's form alone, for the people behind the project: no
  # account, no map (see ProjectSheetLink).
  constraints token: /[A-Za-z0-9]{24,64}/ do
    get "fiche-projet/:token", to: "project_forms#show", as: :project_form
    patch "fiche-projet/:token", to: "project_forms#update"
    post "fiche-projet/:token/submit", to: "project_forms#submit", as: :submit_project_form
    get "fiche-projet/:token/documents", to: "project_form_documents#index", as: :project_form_documents
    post "fiche-projet/:token/documents", to: "project_form_documents#create"
    delete "fiche-projet/:token/documents/:id", to: "project_form_documents#destroy", as: :project_form_document
    get "fiche-projet/:token/documents/:id/file", to: "project_form_documents#file", as: :project_form_document_file
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
  get "regions/locate", to: "regions#locate", as: :locate_region
  resources :maps, only: [] do
    scope module: :maps do
      get "identify", to: "identify#show", as: :identify
      get "parcels/lookup", to: "parcels#lookup", as: :parcel_lookup
      post "parcels", to: "parcels#create", as: :parcels
      post "boundary_import", to: "boundary_imports#create", as: :boundary_import
    end
  end
  # --- end map-data ---
  # --- mobile ---
  # Semisto's phone app (mobile/, MobileApp): its own endpoints; it also
  # calls the editor's JSON endpoints with the same bearer token.
  post "session/review", to: "sessions#review", as: :session_review
  namespace :api do
    namespace :v1 do
      resource :me, only: :show, controller: "me" do
        post :deletion_request
      end
      resources :maps, only: %i[index show] do
        get :style, on: :member, defaults: { format: :json }
        # A drone view's tiles, cut out of its PMTiles archive (AerialTilesController).
        get "aerial_views/:aerial_view_id/tiles/:z/:x/:y", to: "aerial_tiles#show", as: :aerial_tile,
          constraints: { aerial_view_id: /\d+/, z: /\d+/, x: /\d+/, y: /\d+/ }
      end
    end
  end
  # --- end mobile ---
  # --- mcp ---
  # Remote MCP server (Streamable HTTP, stateless) and its OAuth 2.1
  # authorization server, for Claude and other agents.
  post "mcp", to: "mcp#create", as: :mcp
  match "mcp", to: "mcp#method_not_allowed", via: %i[get delete]
  match "mcp", to: "mcp#preflight", via: :options
  # One part of a large file sent after create_upload (McpUpload#part_size).
  put "mcp/uploads/:token/parts/:number", to: "mcp/upload_parts#update", as: :mcp_upload_part,
    constraints: { token: %r{[^/]+}, number: /\d+/ }
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
    resource :tour, only: :update
    resource :password, only: %i[update destroy]
    resource :avatar, only: %i[update destroy]
    resource :logo, only: %i[update destroy]
  end
  # A person's uploaded picture, by its blob's signed id (User#avatar_url).
  get "avatars/:key", to: "avatars#show", as: :avatar
  # A team's or a pro account's logo, by its blob's signed id (HasLogo#logo_url).
  get "logos/:key", to: "logos#show", as: :logo
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
      resources :feature_updates, only: :index do
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
        get :buildings
        get :contour
        get :catchment
        get :keypoints
        get :parallels
        get :storm
      end
      resource :terrain, only: %i[show create]
      resource :water_settings, only: :update
      resources :water_sources, only: %i[index create update destroy]
      resources :plan_images, only: %i[index create update destroy] do
        get :image, on: :member
      end
    end
  end
  # --- end relief-water ---
  # --- billing-site ---
  # Public website (server-side meta tags, French URLs).
  get "fonctionnalites", to: "pages#features", as: :features_page
  get "tarifs", to: "pages#pricing", as: :pricing
  get "mission-drone", to: "pages#drone", as: :drone_mission
  get "open-source", to: "pages#open_source", as: :open_source
  get "ecoconception", to: "pages#ecoconception", as: :ecoconception
  # Measurements of the « EcoIndex » workflow (ECOINDEX_TOKEN).
  post "eco_measurements", to: "eco_measurements#create"
  get "confidentialite", to: "pages#privacy", as: :privacy
  get "conditions", to: "pages#terms", as: :terms
  get "sitemap", to: "pages#sitemap", defaults: { format: "xml" }, as: :sitemap
  # Help center (Markdown articles in app/help); /help/:slug.json feeds the help drawer.
  get "help", to: "help#index", as: :help_center
  get "help/:slug", to: "help#show", as: :help_article, constraints: { slug: /[a-z0-9-]+/ }
  # « Ce guide t'a aidé ? »: the answer, then the optional comment.
  post "help/:slug/feedback", to: "help/feedbacks#create", as: :help_article_feedback, constraints: { slug: /[a-z0-9-]+/ }
  patch "help/feedback", to: "help/feedbacks#update", as: :help_feedback
  namespace :admin do
    get "help", to: "help#show", as: :help
    delete "help/misses/:id", to: "help#destroy_miss", as: :help_miss
  end
  # Plans and payments (Stripe) and the account page.
  get "billing", to: "billing#show", as: :billing
  post "billing/checkout", to: "billing_checkouts#create", as: :billing_checkout
  post "billing/portal", to: "billing_portals#create", as: :billing_portal
  resource :account, only: %i[show update]
  # Asked once after the first sign-in: own place or clients (account kind).
  resource :welcome, only: %i[show update]
  post "account/deletion_request", to: "accounts#deletion_request", as: :account_deletion_request
  post "webhooks/stripe", to: "webhooks/stripe#create"
  # Answers to a team's Tally forms (FormInbox), filed in the map's documents.
  post "webhooks/tally/:token", to: "webhooks/tally#create", as: :tally_webhook, constraints: { token: /[A-Za-z0-9]{20,64}/ }
  # A team map's « Formulaires » view: the links to send, the answers received.
  get "maps/:map_id/forms", to: "maps/forms#index", as: :map_forms
  # --- end billing-site ---
  # --- plants ---
  # Before /plants/:id. The species people propose, for catalogue reviewers.
  resources :catalogue_reviews, path: "plants/review", only: %i[index update] do
    post :check, on: :collection
    member do
      post :merge
      post :reject
      post :gbif
      post :check
    end
  end
  resources :plants, only: %i[index show]
  # Requests for scions, cuttings or seeds between gardeners (« Multiplication »).
  resources :propagation_requests, path: "propagation", only: %i[index create update destroy]
  resources :maps, only: [] do
    scope module: :maps do
      resource :planting, only: :show
      resources :plant_proposals, only: :create do
        collection { get :check }
      end
      resources :palette_items, only: %i[index create update destroy] do
        collection { get :suggestions }
        member do
          post :accept
          post :reject
        end
      end
      resources :features, only: [] do
        resources :patch_items, only: %i[index create update destroy]
        resources :plant_observations, only: %i[index create destroy] do
          member { get :photo }
        end
        resources :plant_harvests, only: %i[index create destroy]
        resources :storage_readings, only: %i[index create destroy]
      end
      resource :plant_list, only: :show do
        get :print
      end
      resources :harvests, only: %i[index create]
    end
  end
  # --- end plants ---
  # --- sun ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :sun, only: :show
    end
  end
  # --- end sun ---
  # --- weather_stations ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :weather_stations, only: :show do
        get :stations
        get :now
      end
    end
  end
  # --- end weather_stations ---
  # --- canopy ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :canopy, only: :show
    end
  end
  # --- end canopy ---
  # --- observed_climate ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :observed_climate, only: :show
      resource :water_balance, only: :show
    end
  end
  # --- end observed_climate ---
  # --- site_rules ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :site_rules, only: :show
    end
  end
  # --- end site_rules ---
  # --- climate-finance ---
  resources :maps, only: [] do
    scope module: :maps do
      resource :climate, only: :show do
        get :forecast
      end
      resource :week, only: :show
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
        collection do
          patch :bulk, action: :bulk_update
          delete :bulk, action: :bulk_destroy
        end
        member do
          get :image
          get :same_spot
        end
        resources :sketches, only: %i[index create update destroy], controller: "photo_sketches"
        resources :renderings, only: %i[index create show], controller: "photo_renderings"
      end
      resources :photo_albums, only: %i[create update destroy]
      resources :documents, only: %i[index show create update destroy] do
        member do
          get :file
          # The text of a Markdown document, read and saved by its editor.
          get :content
          patch :content, action: :update_content
          # Where the shared editor starts (MapDocumentChannel).
          get :collab
        end
      end
      resources :soil_samples, only: %i[index create update destroy] do
        collection do
          post :suggestions
          post :bulk
        end
        resources :reports, only: %i[show create destroy], controller: "soil_sample_reports"
        resource :draft, only: %i[update destroy], controller: "soil_sample_drafts"
      end
      resources :bioindicator_observations, only: %i[index create update destroy] do
        get :species, on: :collection
        post :accept, on: :member
      end
    end
  end
  # --- end soil-photos ---
  # --- map-drawing ---
  scope "maps/:map_id", module: :maps, as: :map, constraints: { map_id: /\d+/ } do
    get "alerts", to: "alerts#index", as: :alerts, defaults: { format: :json }
    get "functions", to: "functions#show", as: :functions, defaults: { format: :json }
    get "export.geojson", to: "exports#show", as: :geojson_export, format: false
  end
  # --- end map-drawing ---
  # --- plantnet ---
  # Species identification from photos (Pl@ntNet), from a plant's inspector.
  resources :maps, only: [] do
    scope module: :maps do
      resources :plant_identifications, only: :create
    end
  end
  # --- end plantnet ---

  # --- offer templates ---
  resources :offer_templates, only: %i[index create edit update destroy]
  # Request forms (« Demandes »): each pro account's public form and the
  # requests it brought in; the form itself at /demande/:slug.
  resources :request_forms, only: %i[index create update] do
    resources :requests, only: %i[show update], controller: "request_forms/requests" do
      post :map, on: :member
    end
  end
  constraints slug: /[a-z0-9][a-z0-9-]{1,62}/ do
    get "demande/:slug", to: "public_request_forms#show", as: :public_request_form
    post "demande/:slug", to: "public_request_forms#create"
    get "demande/:slug/locate", to: "public_request_forms#locate", as: :public_request_form_locate
    get "demande/:slug/parcel", to: "public_request_forms#parcel", as: :public_request_form_parcel
    get "demande/:slug/geocode", to: "public_request_forms#geocode", as: :public_request_form_geocode
  end

  # --- teams ---
  # Teams ("équipes"): members edit every map of the team. The invitation
  # link comes first so "invitations" is never read as a team id.
  get "teams/invitations/:token", to: "team_invitations#show", as: :accept_team_invitation
  resources :teams, only: %i[index create show update destroy] do
    scope module: :teams do
      resources :memberships, only: %i[update destroy]
      # « Forfait de l'équipe »: an admin's plan pays for every team map.
      resource :billing, only: %i[update destroy]
      # The logo printed at the top of the team maps' documents.
      resource :logo, only: %i[update destroy]
      resources :invitations, only: %i[create destroy] do
        post :resend, on: :member
      end
      # The team board (« Tableau de l'équipe »): new requests, projects on
      # one timeline, the season's steps, who carries what.
      resource :board, only: :show do
        resources :projects, only: %i[show update], controller: "board_projects"
        resources :steps, only: %i[create update destroy], controller: "board_steps"
        resources :requests, only: :update, controller: "board_requests" do
          post :qualify, on: :member
        end
      end
      # The team's own forms (Tally) and the answers they bring in.
      resources :forms, only: %i[index create destroy] do
        collection do
          post :connect
          post :reset
        end
      end
      resources :form_responses, only: %i[update destroy]
    end
  end
  resources :maps, only: [] do
    resource :team, only: :update, controller: "maps/teams"
  end
  # --- end teams ---

  # --- dossier ---
  # The printable project dossier (page and its JSON).
  resources :maps, only: [] do
    resource :dossier, only: :show, controller: "maps/dossiers"
  end
  # --- end dossier ---

  # --- offers ---
  # The offer builder of a team map: the working offer and its versions.
  resources :maps, only: [] do
    resource :offer, only: %i[show update], controller: "maps/offers" do
      resources :versions, only: %i[create show update], param: :number, controller: "maps/offer_versions" do
        post :restore, on: :member
      end
    end
  end
  # --- end offers ---

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

  # --- drone ---
  # « Vues drone »: the staff screen where Semisto adds the dated aerial view
  # of a drone order (or of any map) and removes one. The map editor gets a
  # map's views in its props (MapsController#show).
  namespace :admin do
    resources :aerial_views, path: "drone-views", only: %i[index create destroy] do
      post :copy, on: :member
    end
  end
  # Drone views anyone editing the map imports from a file (Couches panel):
  # sent in parts (PUT /mcp/uploads/:token/parts/:n), then converted in the
  # background; `archive` serves the PMTiles archive to whoever sees the map.
  resources :maps, only: [] do
    scope module: :maps do
      resources :aerial_views, only: %i[index create destroy] do
        member do
          post :complete
          get :archive
        end
      end
    end
  end
  # --- end drone ---

  # --- transfer ---
  # « Transférer la carte »: the owner proposes the map to an editor, who
  # accepts or declines (/maps/:map_id/transfers/:id is the recipient's screen).
  resources :maps, only: [] do
    resources :transfers, only: %i[index create show destroy], controller: "maps/transfers" do
      member do
        post :accept
        post :decline
      end
    end
  end
  # --- end transfer ---

  # --- release-notes ---
  # « Nouveautés »: what changed in the Designer, with a thumbs up per entry;
  # staff write them in /admin/release-notes.
  get "nouveautes", to: "release_notes#index", as: :release_notes
  resources :release_notes, path: "nouveautes", only: [] do
    get :screenshot, on: :member
    resource :like, only: %i[create destroy], controller: "release_notes/likes"
  end
  namespace :admin do
    resources :release_notes, path: "release-notes", except: :show
  end
  # --- end release-notes ---

  # --- super-admin ---
  # The staff dashboard (figures, latest accounts and maps, admin log), the
  # accounts list and « Se connecter en tant que », ended from the banner, and
  # « Tech » (version, files and backup, jobs, services), and how complete the
  # plant catalogue is (« Catalogue »).
  namespace :admin do
    get "/", to: "dashboard#show", as: :dashboard
    resources :users, only: %i[index update] do
      resource :impersonation, only: :create
      # « Offrir une formule » (Billing::PlanGift).
      resources :plan_gifts, path: "plan-gifts", only: :create
    end
    post "plan-gifts", to: "plan_gifts#create_all", as: :plan_gifts
    post "plan-gifts/:id/revoke", to: "plan_gifts#revoke", as: :revoke_plan_gift, constraints: { id: /\d+/ }
    resources :maps, only: :index
    get "tech", to: "tech#show", as: :tech
    # « Design »: the « carnet » primitives and what remains to migrate.
    get "design", to: "design#show", as: :design
    get "catalogue", to: "catalogue#show", as: :catalogue
    # « Codes promo »: Stripe promotion codes made and switched off here.
    resources :promo_codes, path: "promo-codes", only: %i[index create] do
      post :deactivate, on: :member
    end
  end
  resource :impersonation, only: :destroy
  # --- end super-admin ---

  # --- plant-palette ---
  # « Palette végétale »: the table of a map's plants (existing, chosen,
  # planned, planted), its saved views and each plant's sheet on the land.
  resources :maps, only: [] do
    scope module: :maps do
      resource :plant_palette, path: "palette", only: :show do
        get "plants/:key", action: :plant, as: :plant, constraints: { key: %r{[^/]+} }
        patch "plants/:key", action: :update_plant, constraints: { key: %r{[^/]+} }
        post "batch", action: :batch
        post "batch/undo", action: :undo_batch, as: :undo_batch
      end
      resources :plant_palette_views, path: "palette/views", only: %i[create update destroy]
    end
  end
  # --- end plant-palette ---
  # --- tasks ---
  # A map's task lists (« Tâches »), and the tasks of all my maps and my
  # teams' maps (/tasks).
  resources :maps, only: [] do
    resources :tasks, only: %i[index create update destroy], controller: "maps/tasks"
    resources :task_lists, only: %i[create update destroy], controller: "maps/task_lists" do
      post :defaults, on: :collection
    end
  end
  get "tasks", to: "tasks#index", as: :my_tasks
  # --- end tasks ---
  # --- site visits ---
  # Walks on the land with the phone: closing one files its report (SiteVisit).
  resources :maps, only: [] do
    resources :site_visits, only: %i[index create], controller: "maps/site_visits"
  end
  # --- end site visits ---
  # --- implementation ---
  # The implementation plan of a map (« Mise en œuvre »): its phases, Semisto's
  # proposed phasing, and elements given to a phase.
  resources :maps, only: [] do
    resource :implementation, only: :show, controller: "maps/implementations" do
      post :proposal
      post :assign
    end
    resources :implementation_phases, path: "implementation/phases", only: %i[create update destroy], controller: "maps/implementation_phases" do
      member do
        post :accept
        post :reject
      end
    end
  end
  # --- end implementation ---

  get "up" => "rails/health#show", as: :rails_health_check
  get "version", to: "app_versions#show", as: :app_version, defaults: { format: :json }
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "pages#home"
end
