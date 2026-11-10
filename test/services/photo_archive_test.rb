require "test_helper"
require "test_helpers/photo_archive_test_helper"

class PhotoArchiveTest < ActiveSupport::TestCase
  include PhotoArchiveTestHelper

  setup { seed_wallonia_photos }

  test "the region's flights, oldest first, each with its infrared twin" do
    vintages = PhotoArchive.vintages(regions(:wallonia))
    assert_equal %w[ortho_1971 ortho_2022_ete ortho_2026], vintages.pluck(:key)
    assert_nil vintages.first[:infrared_key]
    assert_equal "ortho_2026_ir", vintages.last[:infrared_key]
    assert vintages.last[:default]
    assert_equal "summer", vintages.second[:season]
  end

  test "a partial flight that misses the map says so" do
    vintages = PhotoArchive.vintages(regions(:wallonia), uncovered: %w[ortho_2022_ete])
    assert_equal false, vintages.second[:covers_map]
    assert_nil vintages.first[:covers_map]
  end

  test "the latest layer (no year) comes last" do
    photo_layer(regions(:wallonia), "ortho", "ORTHO_LAST", year: nil, position: 50, latest: true)
    assert_equal "ortho", PhotoArchive.vintages(regions(:wallonia)).last[:key]
  end

  test "Web Mercator metres" do
    x, y = PhotoArchive.mercator(4.88, 50.33)
    assert_in_delta 543_239, x, 1
    assert_in_delta 6_503_623, y, 1
  end
end
