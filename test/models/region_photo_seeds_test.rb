require "test_helper"

# The aerial photos of every seeded region read as one timeline
# (PhotoArchive): a year or « latest », one default, twins that exist.
class RegionPhotoSeedsTest < ActiveSupport::TestCase
  setup do
    %w[01_regions 02_wallonia_layers 03_europe_layers 04_france_layers 05_luxembourg_layers 06_brussels_layers 07_flanders_layers].each do |seed|
      load Rails.root.join("db/seeds/#{seed}.rb").to_s
    end
  end

  test "every region with photos has one default photo and a dated timeline" do
    %w[wallonia flanders brussels luxembourg france].each do |key|
      region = Region.find_by!(key:)
      photos = PhotoArchive.layers(region)
      assert photos.size >= 5, "#{key}: several flights"
      assert_equal 1, region.layers.count(&:default?), "#{key}: one default base"
      assert photos.find(&:default?).photo?, "#{key}: the map opens on a photo"
      photos.each do |layer|
        where = "#{key}/#{layer.key}"
        assert layer.option(:year) || layer.option(:latest), "#{where}: a year or the latest"
        assert layer.option(:vintage).present?, "#{where}: a short label"
        assert layer.description.present?, where
        assert Providers::GeoHttp.allowed?(layer.url), "#{where}: relayed host"
        assert_includes [ nil, "spring", "summer", "winter" ], layer.option(:season), where
        next unless layer.infrared?

        twin = photos.find { |l| l.key == layer.option(:infrared_of) }
        assert twin && !twin.infrared?, "#{where}: its true colour photo exists"
      end
      assert_equal photos.map(&:key).uniq.size, photos.size
    end
  end

  test "the keys maps already remember keep working" do
    wallonia = Region.find_by!(key: "wallonia")
    assert_equal %w[ortho_1971 ortho_1994 ortho_2026], wallonia.layers.where(key: %w[ortho_2026 ortho_1994 ortho_1971]).pluck(:key).sort
    assert wallonia.layers.find_by!(key: "ortho_2026").default?
    assert_equal %w[ferraris ortho ortho_1971 ortho_ete], Region.find_by!(key: "flanders").layers.where(key: %w[ortho ortho_ete ortho_1971 ferraris]).pluck(:key).sort
  end

  test "Wallonia from 1971 to 2026, with the partial summer flights marked" do
    wallonia = PhotoArchive.vintages(Region.find_by!(key: "wallonia"))
    assert_equal 1971, wallonia.first[:year]
    assert_equal "ortho_2026", wallonia.last[:key]
    assert_equal %w[ortho_2022_ete ortho_2025_ete], Region.find_by!(key: "wallonia").layers.select(&:partial_coverage?).reject(&:infrared?).map(&:key).sort
  end
end
