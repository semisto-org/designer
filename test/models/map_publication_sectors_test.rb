require "test_helper"
require_relative "../test_helpers/collab_test_helper"

# Presenting a design on its public view: the sector analysis leaves only
# when the owner shows it, as directions and short names, never an AI's
# draft nor the notes on what a sector changes for the design.
class MapPublicationSectorsTest < ActiveSupport::TestCase
  include CollabTestHelper

  setup do
    @map = maps(:ahinvaux)
    @wind = @map.features.create!(layer: "notes", kind: "sector", name: "Vents d'ouest", notes: "Haie brise-vent chez le voisin",
      geometry: Sectors::Arc.for_map(@map, from_deg: 225, to_deg: 315),
      properties: { "sector_type" => "wind", "sector_season" => "all_year", "from_deg" => 225, "to_deg" => 315 })
    @map.features.create!(layer: "notes", kind: "sector", status: "draft", source: "ai", rationale: "Le climat observé le dit.",
      geometry: Sectors::Arc.for_map(@map, from_deg: 0, to_deg: 45), properties: { "sector_type" => "noise", "from_deg" => 0, "to_deg" => 45 })
  end

  def publish(**options)
    MapPublication.publish!(@map, by: @map.owner, options: options.stringify_keys)
  end

  test "the sectors stay private unless the owner shows them" do
    assert_equal false, MapPublication.normalize_options(nil, @map)["show_sectors"]
    publication = publish
    assert_nil publication.as_public[:sectors]
    assert_not publication.features.any? { |f| f.dig("properties", "kind") == "sector" }, "a sector arc never leaves as a plain line"
  end

  test "shown, they carry the sun and each accepted sector, without notes or drafts" do
    sectors = publish(show_sectors: true).as_public[:sectors]
    assert_equal %w[summer_sun winter_sun], sectors["sun"].map { _1["type"] }
    drawn = sectors["drawn"].sole
    assert_equal [ "wind", "all_year", 225.0, 315.0, "Vents d'ouest" ], drawn.values_at("type", "season", "from_deg", "to_deg", "name")
    assert_not_includes drawn.to_json, "voisin"
  end

  test "each type falls in a group, the sun included" do
    assert_equal "sun", Sectors::Arc.group("winter_sun")
    assert_equal "risks", Sectors::Arc.group("flood")
    assert_equal "other", Sectors::Arc.group(nil)
    assert_equal Sectors::Arc::TYPES.sort, (Sectors::Arc::GROUPS.values.flatten - %w[summer_sun winter_sun]).sort
  end
end
