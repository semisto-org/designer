require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/soil_photos_helper"

# The user's AI reads a photo of several wild plants and proposes what it sees.
class McpBioindicatorsTest < ActionDispatch::IntegrationTest
  include McpTestHelper
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @photo = create_photo(location: [ 4.906, 50.341 ], location_source: "exif", taken_at: Time.zone.parse("2026-05-17 14:32"), bioindicator_status: "to_analyze")
  end

  def plants
    [
      { name: "Ortie dioïque", latin_name: "Urtica dioica", catalog_key: "ortie", abundance: "dominant", confidence: "high", rationale: "Grandes feuilles dentées, au premier plan à gauche." },
      { name: "Gaillet gratteron", latin_name: "Galium aparine", abundance: "frequent", confidence: "medium", rationale: "Tiges accrochantes en verticilles, au centre." },
      { name: "Lamier blanc", latin_name: "Lamium album", abundance: "rare", confidence: "low", rationale: "Fleurs blanches en bas à droite, peu nettes." }
    ]
  end

  def propose(token = @owner, **overrides)
    call_tool(token, "propose_bioindicators", { map_id: @map.id, photo_id: @photo.id, summary: "Un sol riche en azote, frais, souvent remué.", plants: }.merge(overrides))
  end

  test "get_map lists the photos left for the AI" do
    data, error = call_tool(@viewer, "get_map", { map_id: @map.id })
    refute error
    photo = data.dig("bioindicators", "photos").sole
    assert_equal [ @photo.id, "to_analyze", [ 4.906, 50.341 ] ], photo.values_at("photo_id", "status", "location")
  end

  test "get_bioindicator_photo gives the image and the curated list" do
    body = mcp_request(@viewer, "tools/call", { name: "get_bioindicator_photo", arguments: { map_id: @map.id, photo_id: @photo.id } })
    result = body["result"]
    refute result["isError"]
    image = result["content"].find { |c| c["type"] == "image" }
    assert_equal "image/jpeg", image["mimeType"]
    assert Base64.strict_decode64(image["data"]).start_with?("\xFF\xD8".b), "a JPEG"
    data = result["structuredContent"]
    assert_includes data["bioindicator_list"].map { |p| p["key"] }, "ortie"
    assert_equal %w[rare present frequent dominant], data["abundances"]
    assert_equal "get_bioindicator_photo", AiAction.last.tool
  end

  test "a photo of another map is not found" do
    text, error = call_tool(@viewer, "get_bioindicator_photo", { map_id: @map.id, photo_id: 999_999 })
    assert error
    assert_match(/introuvable/, text)
  end

  test "propose_bioindicators puts each plant as a draft at the photo's place" do
    data, error = propose
    refute error
    assert_equal 3, data["created"].size
    drafts = @map.bioindicator_observations.drafts.order(:id)
    assert_equal %w[ortie gaillet_gratteron] + [ nil ], drafts.map(&:catalog_key)
    nettle = drafts.first
    assert_equal [ "ai", "high", "dominant", @photo.id ], [ nettle.source, nettle.confidence, nettle.abundance, nettle.map_photo_id ]
    assert_equal [ 4.906, 50.341 ], nettle.lnglat
    assert_equal Date.new(2026, 5, 17), nettle.observed_on
    @photo.reload
    assert_equal "analyzed", @photo.bioindicator_status
    assert_equal "Un sol riche en azote, frais, souvent remué.", @photo.bioindicator_summary
  end

  test "a new proposal for the same photo replaces the drafts not yet reviewed" do
    propose
    kept = @map.bioindicator_observations.drafts.first
    kept.accept!
    propose(plants: plants.first(1))
    assert_equal 1, @map.bioindicator_observations.drafts.count
    assert kept.reload.persisted?
  end

  test "a viewer cannot propose" do
    text, error = propose(@viewer)
    assert error
    assert_match(/éditeurs/, text)
    assert_equal 0, @map.bioindicator_observations.count
  end
end
