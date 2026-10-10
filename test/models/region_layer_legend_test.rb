require "test_helper"

# Every data layer of every seeded region says how to read it (#legends).
class RegionLayerLegendTest < ActiveSupport::TestCase
  SHAPES = %w[fill line dashed outline hatch split point].freeze
  HEX = /\A#\h{6}\z/

  setup do
    %w[01_regions 02_wallonia_layers 03_europe_layers 04_france_layers 05_luxembourg_layers].each do |seed|
      load Rails.root.join("db/seeds/#{seed}.rb").to_s
    end
  end

  test "every data layer has a legend or a legend image" do
    overlays = RegionLayer.overlays.includes(:region).to_a
    assert overlays.size > 20
    missing = overlays.reject { |layer| layer.legend || layer.legend_url.present? }
    assert_empty missing.map { |layer| "#{layer.region.key}/#{layer.key}" }
  end

  test "every seeded legend matches a layer and reads as a legend" do
    YAML.load_file(Rails.root.join("db/seeds/layer_legends.yml")).each do |region_key, legends|
      region = Region.find_by!(key: region_key)
      legends.each do |key, legend|
        where = "#{region_key}/#{key}"
        assert region.layers.exists?(key:), "#{where}: no such layer"
        assert_empty legend.keys - %w[gradient items note], where
        assert legend["gradient"] || legend["items"].present?, "#{where}: a scale or classes"

        if (gradient = legend["gradient"])
          assert gradient["colors"].size >= 2 && gradient["colors"].all? { HEX.match?(_1) }, where
          assert gradient["labels"].size >= 2, where
        end
        Array(legend["items"]).each do |item|
          next assert(item["heading"].present?, where) if item.key?("heading")

          assert item["label"].present?, where
          assert_match HEX, item["color"], where
          assert_match HEX, item["stroke"], where if item["stroke"]
          assert_includes SHAPES, item.fetch("shape", "fill"), where
          assert item["stroke"], "#{where}: a split has two colours" if item["shape"] == "split"
        end
      end
    end
  end

  test "the editor and the public view receive the legend" do
    ph = Region.find_by!(key: "europe").layers.find_by!(key: "sol_ph")
    assert_equal "pH 4", ph.as_inertia.dig(:legend, "gradient", "labels", 0)
    assert_match(/SLD_VERSION=1.1.0/, ph.legend_url)

    sols = Region.find_by!(key: "france").layers.find_by!(key: "sols")
    assert_nil sols.as_inertia[:legend]
    assert_equal "https://data.geopf.fr/annexes/ressources/legendes/INRA.CARTE.SOLS-legend.png", sols.as_inertia[:legendUrl]
  end

  test "reseeding with legends does not bust the tile cache" do
    stamp = RegionLayer.maximum(:updated_at)
    travel 1.minute do
      load Rails.root.join("db/seeds/02_wallonia_layers.rb").to_s
      load Rails.root.join("db/seeds/04_france_layers.rb").to_s
      assert_equal stamp, RegionLayer.maximum(:updated_at)
    end
  end
end
