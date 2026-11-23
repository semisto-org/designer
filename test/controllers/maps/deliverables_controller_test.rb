require "test_helper"
require_relative "../../test_helpers/collab_test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::DeliverablesControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
  end

  test "the team publishes it: editors yes, viewers no; it is a second publication beside the public view" do
    public_view = MapPublication.publish!(@map, by: @owner, title: "Le jardin")
    sign_in_as users(:alice)
    post map_deliverable_path(@map), params: { publication: { title: "x" } }, as: :json
    assert_response :forbidden

    editor = add_member(@map, make_user("Julie"), "editor")
    sign_in_as editor
    get map_deliverable_path(@map), as: :json
    assert_response :success
    assert_nil json["publication"]
    assert_equal false, json.dig("defaults", "options", "hide_address"), "the client reads their own address"
    assert_equal true, json.dig("defaults", "options", "show_planned")
    assert_equal({ "documents" => 0, "photos" => 0, "videos" => 0, "soilSamples" => 0 }, json["contents"])

    post map_deliverable_path(@map), params: { publication: { title: "Dossier de Chris", options: { in_gallery: true } } }, as: :json
    assert_response :success
    deliverable = @map.reload.deliverable
    assert_equal "deliverable", deliverable.kind
    assert_equal false, deliverable.options["in_gallery"], "a deliverable never enters the gallery"
    assert_match %r{/livrable/#{deliverable.token}\z}, json.dig("publication", "url")
    assert_equal public_view, @map.publication, "the public view is untouched"
    assert_not_equal public_view.token, deliverable.token

    post renew_map_deliverable_path(@map), as: :json
    assert_not_equal deliverable.token, @map.reload.deliverable.token
    delete map_deliverable_path(@map), as: :json
    assert_not @map.reload.deliverable.live?
    assert @map.publication.live?
  end

  test "publishing needs a Pro or Team plan; one already published stays readable" do
    deliverable = MapPublication.publish!(@map, by: @owner, title: "Dossier", kind: "deliverable")
    sign_in_as @owner
    with_plan("yearly") do
      patch map_deliverable_path(@map), params: { publication: { title: "Encore" } }, as: :json
      assert_response :payment_required
      get map_deliverable_path(@map), as: :json
      assert_equal false, json["entitled"]
    end
    assert_equal "Dossier", deliverable.reload.title
    get deliverable_path(deliverable.token)
    assert_response :success
  end

  test "marks: a document, a photo (one by one or in bulk) and a soil point" do
    sign_in_as @owner
    doc = @map.documents.new(uploaded_by: @owner)
    doc.file.attach(io: file_fixture("rapport_labo.pdf").open, filename: "r.pdf", content_type: "application/pdf")
    doc.save!
    patch map_document_path(@map, doc), params: { document: { in_deliverable: true } }, as: :json
    assert_response :success
    assert_equal true, json["inDeliverable"]

    photos = [ create_photo, create_photo(salt: 2) ]
    patch bulk_map_photos_path(@map), params: { ids: photos.map(&:id), in_deliverable: true }, as: :json
    assert_response :success
    assert photos.all? { _1.reload.in_deliverable? }
    assert photos.all? { _1.album.nil? }, "marking does not file them out of their album"

    sample = @map.soil_samples.create!(label: "S1", status: "sampled", depth_from_cm: 0, depth_to_cm: 30, created_by: @owner)
    patch map_soil_sample_path(@map, sample), params: { soil_sample: { in_deliverable: true } }, as: :json
    assert_response :success
    assert_equal true, json["inDeliverable"]

    get map_deliverable_path(@map), as: :json
    assert_equal({ "documents" => 1, "photos" => 2, "videos" => 0, "soilSamples" => 1 }, json["contents"])
  end
end
