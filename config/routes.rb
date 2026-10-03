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

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "maps#index"
end
