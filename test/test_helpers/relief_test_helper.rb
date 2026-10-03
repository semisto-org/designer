# Shared by the relief tests: a region configured like Wallonia (with a tiny
# margin and small chunks so a test grid is a few hundred cells) and a fake
# SPW answering ArcGIS `identify` and `export` like the real services.
module ReliefTestHelper
  SPW = "https://geoservices.example.test/arcgis/rest/services".freeze
  MNT = "#{SPW}/RELIEF/MNT/MapServer".freeze
  MNS = "#{SPW}/RELIEF/MNS/MapServer".freeze
  OCS = "#{SPW}/SOL/OCS/MapServer".freeze
  ORTHO = "#{SPW}/IMAGERIE/ORTHO/MapServer".freeze
  JPEG = "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00fake-ortho".b.freeze

  def relief_settings(**overrides)
    {
      "relief" => {
        "provider" => "arcgis_elevation", "label" => "SPW de test", "attribution" => "© SPW (test)",
        "timezone" => "Europe/Brussels", "margin_m" => 4, "chunk" => 300, "threads" => 2,
        "datasets" => {
          "terrain" => { "url" => MNT, "label" => "MNT de test" },
          "surface" => { "url" => MNS, "label" => "MNS de test" },
          "landcover" => { "url" => OCS, "label" => "Occupation de test" },
          "texture" => { "url" => ORTHO, "label" => "Ortho de test" }
        }
      }.merge(overrides.stringify_keys),
      "hydrology" => {
        "annual_rainfall_mm" => 850, "roof_coefficient" => 0.8, "soil" => "loam", "uniform_rate_mm_h" => 10,
        "storage_mm" => 50, "percolation_mm_h" => 0.5,
        "soils" => { "clay" => { "rate_factor" => 0.4, "storage_factor" => 1.2 }, "loam" => { "rate_factor" => 1.0, "storage_factor" => 1.0 } }
      }
    }
  end

  def configure_relief_region(region = regions(:wallonia), **overrides)
    region.update!(settings: region.settings.merge(relief_settings(**overrides)))
    region
  end

  # A small map: ~20 m × 20 m, so with a 4 m margin the 1 m grid has ~30 × 30 cells.
  def small_map(owner: users(:michael))
    map = Map.create!(name: "Petit jardin", owner:, region: regions(:wallonia))
    map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.00025))
    map
  end

  # Stubs identify on a MapServer: each point gets `value.call(x, y)` (EPSG:3857).
  def stub_identify(url, value)
    stub_request(:post, "#{url}/identify").to_return do |request|
      params = URI.decode_www_form(request.body).to_h
      points = JSON.parse(params.fetch("geometry")).fetch("points")
      results = points.map do |x, y|
        v = value.call(x, y)
        { "layerId" => 0, "layerName" => "test", "value" => v.to_s, "displayFieldName" => "",
          "attributes" => { "Pixel Value" => v.nil? ? "NoData" : v.to_s, "Stretched value" => "1" } }
      end
      { status: 200, body: { results: }.to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  # A tilted plane: 200 m high, rising 10 cm per metre towards the north.
  def stub_spw(surface: true, landcover: true, texture: true)
    y0 = Relief::Mercator.forward(4.9, 50.34).last
    scale = Math.cos(50.34 * Math::PI / 180)
    stub_identify(MNT, ->(_x, y) { (200 + (y - y0) * scale * 0.1).round(2) })
    stub_identify(MNS, ->(_x, y) { (202 + (y - y0) * scale * 0.1).round(2) }) if surface
    stub_identify(OCS, ->(x, _y) { x.to_i.even? ? 7 : 9 }) if landcover
    stub_request(:get, %r{#{Regexp.escape(ORTHO)}/export}).to_return(status: 200, body: JPEG, headers: { "Content-Type" => "image/jpeg" }) if texture
  end

  def instant_provider(region = regions(:wallonia))
    Providers::Elevation.for(region, sleeper: ->(_) { })
  end
end
