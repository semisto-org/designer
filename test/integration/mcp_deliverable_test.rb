require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/soil_photos_helper"

# The user's AI helps a design office choose what goes in the client
# deliverable (« Livrable client »): it reads what is marked and marks or
# unmarks files when asked. Publishing stays a gesture of the team.
class McpDeliverableTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @document = @map.documents.new(uploaded_by: users(:michael), title: "Plan de plantation")
    @document.file.attach(io: file_fixture("rapport_labo.pdf").open, filename: "plan.pdf", content_type: "application/pdf")
    @document.save!
    @photo = create_photo
    @sample = @map.soil_samples.create!(label: "S1", status: "sampled", depth_from_cm: 0, depth_to_cm: 30, created_by: users(:michael))
  end

  test "mark_for_deliverable marks documents, photos and soil points for the client, for editors only" do
    _, error = call_tool(@viewer, "mark_for_deliverable", { map_id: @map.id, in_deliverable: true, document_ids: [ @document.id ] })
    assert error

    data, error = call_tool(@owner, "mark_for_deliverable", {
      map_id: @map.id, in_deliverable: true, document_ids: [ @document.id ], photo_ids: [ @photo.id ], soil_sample_ids: [ @sample.id ]
    })
    refute error, data
    assert_equal 3, data["changed"]
    assert_equal({ "documents" => 1, "photos" => 1, "videos" => 0, "soil_samples" => 1 }, data["marked"])
    assert_nil data["deliverable_url"], "nothing is published yet"
    assert [ @document, @photo, @sample ].all? { _1.reload.in_deliverable? }
    assert_equal({ "changed" => 3 }, AiAction.last.result)

    docs, = call_tool(@owner, "list_documents", { map_id: @map.id })
    assert_equal true, docs["documents"].find { _1["id"] == @document.id }["in_deliverable"]

    publication = MapPublication.publish!(@map, by: users(:michael), title: "Dossier", kind: "deliverable")
    map, = call_tool(@owner, "get_map", { map_id: @map.id })
    assert_equal true, map.dig("deliverable", "published")
    assert_match %r{/livrable/#{publication.token}\z}, map.dig("deliverable", "url")
    assert_equal 1, map.dig("deliverable", "marked", "soil_samples")
    viewer_map, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_nil viewer_map["deliverable"], "the client's private link stays with the team"

    data, = call_tool(@owner, "mark_for_deliverable", { map_id: @map.id, in_deliverable: false, photo_ids: [ @photo.id ] })
    assert_match %r{/livrable/}, data["deliverable_url"]
    refute @photo.reload.in_deliverable?
  end

  test "a soil point's photos never follow its mark: each one is marked itself, and counted" do
    of_sample = create_photo(salt: 2, soil_sample: @sample, caption: "Bon de commande")
    data, error = call_tool(@owner, "mark_for_deliverable", { map_id: @map.id, in_deliverable: true, soil_sample_ids: [ @sample.id ] })
    refute error, data
    assert_equal 0, data["marked"]["photos"]
    refute of_sample.reload.in_deliverable?

    samples, = call_tool(@owner, "get_soil_samples", { map_id: @map.id })
    photo = samples["samples"].find { _1["id"] == @sample.id }["photos"].find { _1["photo_id"] == of_sample.id }
    assert_nil photo["in_deliverable"]

    data, = call_tool(@owner, "mark_for_deliverable", { map_id: @map.id, in_deliverable: true, photo_ids: [ of_sample.id ] })
    assert_equal 1, data["marked"]["photos"]
    samples, = call_tool(@owner, "get_soil_samples", { map_id: @map.id })
    assert_equal true, samples["samples"].find { _1["id"] == @sample.id }["photos"].first["in_deliverable"]
  end

  test "files of another map are refused, and the plan must include the deliverable" do
    text, error = call_tool(@owner, "mark_for_deliverable", { map_id: @map.id, in_deliverable: true, photo_ids: [ 999_999 ] })
    assert error
    assert_match(/999999/, text)

    with_plan("yearly") do
      text, error = call_tool(@owner, "mark_for_deliverable", { map_id: @map.id, in_deliverable: true, document_ids: [ @document.id ] })
      assert error
      assert_match(/Pro et Team/, text)
    end
  end
end
