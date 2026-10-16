require "test_helper"
require_relative "../../test_helpers/wikimedia_commons_test_helper"

class Providers::WikimediaCommonsTest < ActiveSupport::TestCase
  include WikimediaCommonsTestHelper

  test "finds the taxon's image on Wikidata, with its author and licence from Commons" do
    stub_wikidata_images("Mespilus germanica 01.jpg")
    stub_commons_info("Mespilus germanica 01.jpg")

    image = Providers::WikimediaCommons.build({}).main_image("Mespilus germanica")

    assert_requested(:get, /query\.wikidata\.org/) { |r| r.uri.query_values["query"].include?('"Mespilus germanica"') }
    assert_equal "Mespilus germanica 01.jpg", image.file_title
    assert_equal "Jean Dupont", image.author
    assert_equal "CC BY-SA 4.0", image.license
    assert_match %r{\Ahttps://upload.wikimedia.org/.+/1600px-}, image.thumb_url
    assert_equal "https://commons.wikimedia.org/wiki/File:Mespilus%20germanica%2001.jpg", image.page_url
  end

  test "asks for hybrids the way Wikidata writes them, without a space after ×" do
    stub_wikidata_images

    assert_nil Providers::WikimediaCommons.build({}).main_image("Mentha × piperita")
    assert_requested(:get, /query\.wikidata\.org/) { |r| r.uri.query_values["query"].include?('"Mentha ×piperita"') }
  end

  test "prefers a photo to a botanical plate, and skips a file that is not free" do
    stub_wikidata_images("Köhler plate.jpg", "Not free.jpg", "Photo.jpg")
    stub_commons_info("Köhler plate.jpg", license: "Public domain")
    stub_commons_info("Not free.jpg", license: "CC BY-NC 2.0")
    stub_commons_info("Photo.jpg")

    assert_equal "Photo.jpg", Providers::WikimediaCommons.build({}).main_image("Prunus avium").file_title
    assert_not_requested(:get, COMMONS, query: hash_including("titles" => "File:Köhler plate.jpg"))
  end

  test "falls back to the plate when it is the only free image" do
    stub_wikidata_images("Köhler plate.jpg")
    stub_commons_info("Köhler plate.jpg", license: "Public domain", artist: nil)

    image = Providers::WikimediaCommons.build({}).main_image("Prunus avium")
    assert_equal "Public domain", image.license
    assert_nil image.author
  end

  test "rate limiting is unavailable, not « no image »" do
    stub_wikidata_images(status: 429)
    assert_raises(Providers::WikimediaCommons::Unavailable) { Providers::WikimediaCommons.build({}).main_image("Malus domestica") }
  end

  test "WIKIMEDIA_PROVIDER=none turns it off" do
    commons = Providers::WikimediaCommons.build("WIKIMEDIA_PROVIDER" => "none")
    assert_not commons.available?
    assert_raises(Providers::WikimediaCommons::Unavailable) { commons.main_image("Malus domestica") }
  end
end
