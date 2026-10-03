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

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "maps#index"
end
