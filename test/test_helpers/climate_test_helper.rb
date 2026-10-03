# Seeds the region's climate reference data (config/climate/<key>.yml) the
# way db/seeds/40_climate.rb does, for tests of the climate panel.
module ClimateTestHelper
  def seed_climate!(region = regions(:wallonia))
    data = YAML.load_file(Rails.root.join("config/climate/#{region.key}.yml"))
    region.update!(settings: region.settings.merge("climate" => data))
    region
  end

  # Runs the block with a memory cache instead of the test null store.
  def with_memory_cache
    previous = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    yield
  ensure
    Rails.cache = previous
  end

  # Runs the block with billing on, so that the free plan is enforced.
  def with_billing
    previous = ENV["STRIPE_SECRET_KEY"]
    ENV["STRIPE_SECRET_KEY"] = "sk_test_climate"
    yield
  ensure
    ENV["STRIPE_SECRET_KEY"] = previous
  end
end
