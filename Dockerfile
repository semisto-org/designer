# syntax=docker/dockerfile:1
# check=error=true

# Production image, built by Coolify on every push to main:
#   docker build -t designer .
#   docker run -d -p 80:80 -e SECRET_KEY_BASE=... -e DATABASE_URL=postgis://... designer
# The database server needs the PostGIS extension (e.g. image postgis/postgis:16-3.4).

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.3.6
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

# Rails app lives here
WORKDIR /rails

# Install base packages
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libjemalloc2 libvips postgresql-client libgeos-c1v5 ghostscript ffmpeg gdal-bin && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Set production environment variables and enable jemalloc for reduced memory usage and latency.
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

# go-pmtiles (BSD-3-Clause) packs imported drone views into one PMTiles
# archive (AerialViews::Tiler). Built from its tagged module, which Go's
# checksum database verifies; static, so it runs on the base image as is.
FROM docker.io/library/golang:1.25-bookworm AS pmtiles
RUN CGO_ENABLED=0 GOBIN=/out go install -ldflags="-s -w" github.com/protomaps/go-pmtiles@v1.31.2

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libvips libyaml-dev pkg-config libgeos-dev && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Node.js to build the React frontend with Vite
COPY --from=docker.io/library/node:22-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=docker.io/library/node:22-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Install application gems
COPY vendor/* ./vendor/
COPY Gemfile Gemfile.lock ./

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    # -j 1 disable parallel compilation to avoid a QEMU bug: https://github.com/rails/bootsnap/issues/495
    bundle exec bootsnap precompile -j 1 --gemfile

# Install JavaScript dependencies
COPY package.json package-lock.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

# Copy application code
COPY . .

# Precompile bootsnap code for faster boot times.
# -j 1 disable parallel compilation to avoid a QEMU bug: https://github.com/rails/bootsnap/issues/495
RUN bundle exec bootsnap precompile -j 1 app/ lib/

# Precompiling assets (Vite build included) without requiring production secrets.
# node_modules is already installed above: vite_ruby must not run `npm ci` a
# second time. Keep tmp/cache/bootsnap (the two precompile steps above write
# there); only Vite's build metadata and the dummy secret go. The offline
# site's viewer (public/offline-viewer) is built here too: OfflineSite::Builder
# packs it into every export.
RUN SECRET_KEY_BASE_DUMMY=1 VITE_RUBY_SKIP_ASSETS_PRECOMPILE_INSTALL=true ./bin/rails assets:precompile && \
    npm run build:offline && \
    rm -rf node_modules tmp/cache/vite tmp/local_secret.txt




# Final stage for app image
FROM base

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash
USER 1000:1000

# Copy built artifacts: gems, application
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails
COPY --from=pmtiles /out/go-pmtiles /usr/local/bin/pmtiles

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start server via Thruster by default, this can be overwritten at runtime
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
