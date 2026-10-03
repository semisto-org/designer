# Idempotent seeds: regions and their layer catalogues. Run on every deploy
# (bin/docker-entrypoint) and locally with bin/rails db:seed.
Dir[Rails.root.join("db/seeds/*.rb")].sort.each { |file| load file }
