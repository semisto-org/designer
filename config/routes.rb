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

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "maps#index"
end
