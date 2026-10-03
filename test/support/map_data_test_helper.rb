# Shared helpers for the map-data tests (catalogue, provider stubs, cache).
module MapDataTestHelper
  SPW_REST = %r{\Ahttps://geoservices\.wallonie\.be/arcgis/rest/services/}
  SPW_WMS = %r{\Ahttps://geoservices\.wallonie\.be/arcgis/services/}

  # The real Wallonia catalogue, from its seed file.
  def seed_wallonia_layers
    load Rails.root.join("db/seeds/02_wallonia_layers.rb").to_s
    regions(:wallonia).layers.reload
  end

  def wallonia_layer(key)
    regions(:wallonia).layers.find_by!(key:)
  end

  def provider_fixture(name)
    file_fixture("providers/#{name}").read
  end

  def json_response(name)
    { status: 200, body: provider_fixture(name), headers: { "Content-Type" => "application/json" } }
  end

  # Tests run with a null cache store: swap in a real one when caching is
  # what we test.
  def with_memory_cache
    original = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    yield
  ensure
    Rails.cache = original
  end

  def stub_identify(service, fixture)
    stub_request(:get, %r{\Ahttps://geoservices\.wallonie\.be/arcgis/rest/services/#{Regexp.escape(service)}/MapServer/identify})
      .to_return(json_response(fixture))
  end
end
