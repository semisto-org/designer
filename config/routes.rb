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

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "maps#index"
end
