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

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "maps#index"
end
