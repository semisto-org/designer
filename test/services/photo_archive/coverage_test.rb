require "test_helper"
require "test_helpers/photo_archive_test_helper"

class PhotoArchive::CoverageTest < ActiveSupport::TestCase
  include PhotoArchiveTestHelper

  setup do
    seed_wallonia_photos
    @map = maps(:ahinvaux)
    Rails.cache.clear
  end

  test "a partial flight that answers all white does not cover the map, nor does its twin" do
    stub_photo("ORTHO_2022_ETE", jpeg([ 255, 255, 255 ]))
    assert_equal %w[ortho_2022_ete ortho_2022_ete_ir], PhotoArchive::Coverage.uncovered(@map)
    assert_requested :get, /ORTHO_2022_ETE\/MapServer/, times: 1
    assert_not_requested :get, /ORTHO_1971/
  end

  test "a photo over the map covers it, and the answer is kept" do
    stub_photo("ORTHO_2022_ETE", jpeg)
    with_memory_cache do
      2.times { assert_empty PhotoArchive::Coverage.uncovered(@map) }
    end
    assert_requested :get, /ORTHO_2022_ETE\/MapServer/, times: 1
  end

  test "an upstream error leaves the flight offered" do
    stub_request(:get, /ORTHO_2022_ETE/).to_return(status: 503)
    assert_empty PhotoArchive::Coverage.uncovered(@map)
  end

  test "a transparent image is blank" do
    assert PhotoArchive::Coverage.blank?(Vips::Image.black(4, 4, bands: 4))
    refute PhotoArchive::Coverage.blank?(Vips::Image.black(4, 4, bands: 3).add([ 10, 80, 20 ]))
  end

  private
    def with_memory_cache
      previous = Rails.cache
      Rails.cache = ActiveSupport::Cache::MemoryStore.new
      yield
    ensure
      Rails.cache = previous
    end
end
