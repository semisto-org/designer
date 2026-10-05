require "test_helper"
require_relative "../../../test_helpers/climate_test_helper"

# The climate reference files of every seeded region (config/climate/*.yml):
# well formed, every value referenced, and each place falls in the
# expected natural sub-area.
class Providers::Climate::RegionalClimateTest < ActiveSupport::TestCase
  include ClimateTestHelper

  NORMALS = %w[mean_temp_c summer_mean_temp_c winter_mean_temp_c annual_precip_mm frost_days extreme_min_c
               last_spring_frost first_autumn_frost].freeze
  DELTAS = %w[mean_temp_delta_c extreme_min_delta_c summer_temp_delta_c summer_precip_change_pct winter_precip_change_pct].freeze

  Dir[Rails.root.join("config/climate/*.yml")].each do |file|
    key = File.basename(file, ".yml")

    test "#{key} climate file is complete and consistent" do
      data = YAML.load_file(file)
      sources = data["sources"].map { _1["key"] }
      areas = data["sub_areas"]

      assert_equal 1, areas.count { _1["default"] }, "exactly one default sub-area"
      assert_equal areas.size, areas.map { _1["key"] }.uniq.size
      areas.each do |area|
        assert_equal NORMALS.sort, area["normals"].keys.sort, area["key"]
        assert area["normals"]["last_spring_frost"] < area["normals"]["first_autumn_frost"], area["key"]
        NORMALS.each do |field|
          reference = area.dig("references", field)
          assert reference && reference["detail"].present?, "#{area["key"]} #{field} has a reference"
          assert reference["sources"].present? && (reference["sources"] - sources).empty?, "#{area["key"]} #{field} cites listed sources"
        end
        assert area["stations"].present?, "#{area["key"]} lists its stations"
        assert (area["stations"].map { _1["source"] } - sources).empty?, "#{area["key"]} station sources"
        next if area["default"]
        geometry = RGeo::GeoJSON.decode(area["geometry"], geo_factory: GeoJsonGeometry::FACTORY)
        assert geometry&.valid?, "#{area["key"]} outline is a valid polygon"
      end
      %w[normals projections zones].each { |use| assert data["sources"].any? { _1["used_for"] == use }, use }
      assert (data.dig("projections", "sources") - sources).empty?
      data.dig("projections", "horizons").each do |horizon, scenarios|
        %w[moderate high].each do |scenario|
          DELTAS.each do |delta|
            low, central, high = scenarios.dig(scenario, delta)
            assert low <= central && central <= high, "#{horizon} #{scenario} #{delta}"
            assert scenarios.dig(scenario, "references", delta).present?, "#{horizon} #{scenario} #{delta} has a reference"
          end
        end
      end
    end
  end

  test "France: each place gets its natural sub-area" do
    provider = Providers::Climate::Static.new(seed_climate!(Region.create!(key: "france", name: "France", country_code: "FR")))
    {
      [ 2.35, 48.85 ] => [ "bassin_parisien", "8b" ],   # Paris
      [ 3.06, 50.63 ] => [ "bassin_parisien", "8b" ],   # Lille
      [ -4.49, 48.39 ] => [ "ouest", "9a" ],            # Brest
      [ -1.55, 47.22 ] => [ "ouest", "9a" ],            # Nantes
      [ -0.58, 44.84 ] => [ "sud_ouest", "9a" ],        # Bordeaux
      [ 1.44, 43.60 ] => [ "sud_ouest", "9a" ],         # Toulouse
      [ 5.37, 43.30 ] => [ "mediterranee", "9b" ],      # Marseille
      [ 2.90, 42.70 ] => [ "mediterranee", "9b" ],      # Perpignan
      [ 8.74, 41.92 ] => [ "mediterranee", "9b" ],      # Ajaccio
      [ 4.84, 45.76 ] => [ "rhone_saone", "8b" ],       # Lyon
      [ 5.72, 45.19 ] => [ "rhone_saone", "8b" ],       # Grenoble
      [ 7.75, 48.58 ] => [ "nord_est", "8a" ],          # Strasbourg
      [ 5.04, 47.32 ] => [ "nord_est", "8a" ],          # Dijon
      [ 6.02, 47.24 ] => [ "nord_est", "8a" ],          # Besançon
      [ 6.87, 45.92 ] => [ "alpes_jura", "7a" ],        # Chamonix
      [ 6.07, 46.50 ] => [ "alpes_jura", "7a" ],        # Les Rousses (Jura)
      [ 0.14, 42.90 ] => [ "pyrenees", "8a" ],          # Barèges
      [ 3.88, 45.04 ] => [ "massif_central", "8a" ]     # Le Puy-en-Velay
    }.each do |(lng, lat), (key, zone)|
      result = provider.current_normals([ lng, lat ])
      assert_equal key, result.data[:sub_area][:key], "#{lng}, #{lat}"
      assert_equal zone, result.data[:zone][:code], "#{lng}, #{lat}"
    end
    assert provider.current_normals([ 2.35, 48.85 ]).data[:sources].any? { _1[:key] == "meteofrance_daily" }
    assert provider.projection([ 2.35, 48.85 ], horizon: 2050, scenario: "moderate").available?
  end

  test "Luxembourg: Oesling in the north, Gutland elsewhere" do
    provider = Providers::Climate::Static.new(seed_climate!(Region.create!(key: "luxembourg", name: "Luxembourg", country_code: "LU")))
    assert_equal "oesling", provider.current_normals([ 6.03, 50.05 ]).data[:sub_area][:key] # Clervaux
    assert_equal "8a", provider.current_normals([ 6.03, 50.05 ]).data[:zone][:code]
    assert_equal "gutland", provider.current_normals([ 6.13, 49.61 ]).data[:sub_area][:key] # Luxembourg
    assert_equal "8a", provider.current_normals([ 6.13, 49.61 ]).data[:zone][:code]
    assert provider.current_normals([ 6.13, 49.61 ]).data[:sources].any? { _1[:key] == "meteolux_normals" }
  end
end
