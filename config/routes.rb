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
