require "test_helper"
require_relative "../../test_helpers/jev_test_helper"

class Providers::PlantPagesTest < ActiveSupport::TestCase
  include JevTestHelper

  test "reads PFAF and Wikipédia, and leaves out a page that does not exist" do
    stub_pfaf("Salvia nemorosa", "Salvia nemorosa is a perennial growing to 0.6 m by 0.5 m.")
    stub_wikipedia("en", "Salvia nemorosa", "Salvia nemorosa, the woodland sage, is a hardy herbaceous perennial plant native to Europe. " * 4 +
                                             "\n== Etymology ==\nNot about the plant.\n== Cultivation ==\nGrows in full sun.")
    stub_wikipedia("fr", "Salvia nemorosa")
    pages = Providers::PlantPages.new.for("Salvia nemorosa")

    assert_equal %w[pfaf wikipedia_en], pages.map(&:key)
    assert_equal [ false, true ], pages.map(&:quotable)
    assert_includes pages.last.text, "Grows in full sun"
    assert_not_includes pages.last.text, "Not about the plant"
    assert_equal "https://en.wikipedia.org/wiki/Salvia_nemorosa", pages.last.url
  end

  test "a source that fails does not stop the others" do
    stub_pfaf("Salvia nemorosa")
    stub_request(:get, %r{wikipedia\.org}).to_return(status: 503)
    assert_equal [], Providers::PlantPages.new.for("Salvia nemorosa")
    assert_equal [], Providers::PlantPages.new(available: false).for("Salvia nemorosa")
  end
end
