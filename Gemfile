source "https://rubygems.org"

# Bundle edge Rails instead: gem "rails", github: "rails/rails", branch: "main"
gem "rails", "~> 8.1.4"
# The modern asset pipeline for Rails [https://github.com/rails/propshaft]
gem "propshaft"
# Use postgresql as the database for Active Record
gem "pg", "~> 1.1"
# Use the Puma web server [https://github.com/puma/puma]
gem "puma", ">= 5.0"

# Geospatial: PostGIS columns as RGeo objects, GeoJSON in and out
gem "activerecord-postgis-adapter", "~> 11.1"
gem "rgeo-geojson"

# Frontend: React + TypeScript pages served through Inertia, bundled by Vite
gem "inertia_rails", "~> 3.22"
gem "vite_rails", "~> 3.11"

# Sign in with Google (no passwords; magic links are built in)
gem "omniauth", "~> 2.1"
gem "omniauth-google-oauth2", "~> 1.2"
gem "omniauth-rails_csrf_protection", "~> 2.0"

# Payments (Checkout, customer portal, webhooks)
gem "stripe", "~> 20.0"

# Model Context Protocol server (Claude and other agents on a map)
gem "mcp", "~> 1.6"

# Markdown help center
gem "commonmarker", "~> 2.0"

# HTTP client for external providers (Géoportail, cadastre, climate)
gem "faraday", "~> 2.12"

# CSV exports (plant list); leaves Ruby's default gems in 3.4
gem "csv"

# Error tracking
gem "sentry-ruby"
gem "sentry-rails"

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem "tzinfo-data", platforms: %i[ windows jruby ]

# Use the database-backed adapters for Rails.cache, Active Job, and Action Cable
gem "solid_cache"
gem "solid_queue"
gem "solid_cable"

# Reduces boot times through caching; required in config/boot.rb
gem "bootsnap", require: false

# Add HTTP asset caching/compression and X-Sendfile acceleration to Puma [https://github.com/basecamp/thruster/]
gem "thruster", require: false

# Use Active Storage variants [https://guides.rubyonrails.org/active_storage_overview.html#transforming-images]
gem "image_processing", "~> 1.2"

# S3-compatible object storage (Hetzner, Scaleway…) for Active Storage in production
gem "aws-sdk-s3", "~> 1.233", require: false

group :development, :test do
  # See https://guides.rubyonrails.org/debugging_rails_applications.html#debugging-with-the-debug-gem
  gem "debug", platforms: %i[ mri windows ], require: "debug/prelude"

  # Audits gems for known security defects (use config/bundler-audit.yml to ignore issues)
  gem "bundler-audit", require: false

  # Static analysis for security vulnerabilities [https://brakemanscanner.org/]
  gem "brakeman", require: false

  # Omakase Ruby styling [https://github.com/rails/rubocop-rails-omakase/]
  gem "rubocop-rails-omakase", require: false
end

group :test do
  gem "webmock"
end

group :development do
  # Use console on exceptions pages [https://github.com/rails/web-console]
  gem "web-console"
end

# Spreadsheet exports (financial dashboard for banks and funders)
gem "caxlsx", "~> 4.5"
