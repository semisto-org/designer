require "test_helper"
require_relative "../test_helpers/wikimedia_commons_test_helper"

class PlantPhotoJobTest < ActiveJob::TestCase
  include WikimediaCommonsTestHelper

  setup { @apple = plant_species(:apple) }

  test "copies the species' Commons photo with what its licence asks to show" do
    stub_wikidata_images("Malus domestica a.jpg")
    stub_commons_download(stub_commons_info("Malus domestica a.jpg"))

    PlantPhotoJob.perform_now(@apple)

    photo = @apple.photos.sole
    assert photo.image.attached?
    assert_equal [ "Jean Dupont", "CC BY-SA 4.0", "wikimedia_commons" ], [ photo.author, photo.license, photo.source ]
    assert_not_nil @apple.reload.photo_looked_up_at
    json = @apple.sheet_json[:photo]
    assert_equal "Jean Dupont", json[:author]
    assert_match %r{/rails/active_storage/representations/}, json[:cardUrl]
  end

  test "a species without a free image is recorded as looked up, and retried a month later" do
    stub_wikidata_images

    PlantPhotoJob.perform_now(@apple)
    assert_empty @apple.photos
    assert_not_nil @apple.reload.photo_looked_up_at

    PlantSpecies.where.not(id: @apple.id).update_all(photo_looked_up_at: 1.day.ago)
    assert_equal 0, PlantPhotoJob.backfill
    @apple.update_columns(photo_looked_up_at: 31.days.ago)
    assert_equal 1, PlantPhotoJob.backfill
    assert_in_delta Time.current, @apple.reload.photo_looked_up_at, 5
  end

  test "the backfill stops without recording anything when Wikimedia does not answer" do
    stub_wikidata_images(status: 429)

    assert_equal 0, PlantPhotoJob.backfill
    assert PlantSpecies.where.not(photo_looked_up_at: nil).none?
  end

  test "the backfill skips species that have a photo or were looked up recently" do
    stub_wikidata_images
    PlantPhotoJob.backfill(limit: 100)
    assert PlantSpecies.where(photo_looked_up_at: nil).none?
    assert_equal 0, PlantPhotoJob.backfill(limit: 100)
  end

  test "nothing happens when the provider is turned off" do
    assert_equal 0, PlantPhotoJob.backfill(provider: Providers::WikimediaCommons.build("WIKIMEDIA_PROVIDER" => "none"))
  end
end
