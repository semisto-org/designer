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

  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  root "maps#index"
end
