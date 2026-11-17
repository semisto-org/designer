require "test_helper"

class MapFeatureTagsTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def feature!(tags, layer: "notes", kind: "note", status: "active")
    @map.features.create!(layer:, kind:, status:, geometry: point(lng: 4.906, lat: 50.341), tags:)
  end

  test "tags are trimmed, single-spaced and deduplicated whatever the case, in typed order" do
    feature = feature!([ "  Zone   nord ", "phase 1", "zone nord", "", "Phase 1", nil ])
    assert_equal [ "Zone nord", "phase 1" ], feature.tags
    assert_equal [ "a", "b" ], @map.features.new(tags: "a, b,,a").tap(&:valid?).tags
  end

  test "at most 20 tags of 40 characters" do
    assert_not @map.features.new(layer: "notes", kind: "note", geometry: point, tags: (1..21).map(&:to_s)).valid?
    feature = @map.features.new(layer: "notes", kind: "note", geometry: point, tags: [ "x" * 41 ])
    assert_not feature.valid?
    assert_match(/40 caractères/, feature.errors.full_messages.to_sentence)
  end

  test "tagged finds a tag whatever its case; tag_counts lists one spelling per tag, sorted" do
    shed = feature!([ "Phase 1", "Zone nord" ])
    pipe = feature!([ "phase 1" ], layer: "existing", kind: "tree")
    feature!([])
    assert_equal [ shed, pipe ].sort, @map.features.tagged("PHASE 1").sort
    assert_equal({ "Phase 1" => 2, "Zone nord" => 1 }, @map.features.order(:id).tag_counts)
  end

  test "the GeoJSON of a feature carries its tags" do
    assert_equal [ "haie" ], feature!([ "haie" ]).as_geojson[:properties]["tags"]
  end

  test "rename_tag! renames a tag whatever its case, merging it into a tag already used" do
    a = feature!([ "analyse", "pré-projet" ])
    b = feature!([ "Sol", "Analyse" ])
    c = feature!([ "autre" ])
    assert_equal 2, @map.features.rename_tag!("ANALYSE", "  Analyses   de sol ")
    assert_equal [ "Analyses de sol", "pré-projet" ], a.reload.tags
    assert_equal [ "Sol", "Analyses de sol" ], b.reload.tags
    assert_equal [ "autre" ], c.reload.tags

    assert_equal 2, @map.features.rename_tag!("Analyses de sol", "sol")
    assert_equal [ "Sol" ], b.reload.tags, "the two tags merge"
    assert_equal [ "sol", "pré-projet" ], a.reload.tags
    assert_equal 0, @map.features.rename_tag!("sol", "sol")
    assert_raises(ActiveRecord::RecordInvalid) { @map.features.rename_tag!("autre", "x" * 41) }
    assert_equal [ "autre" ], c.reload.tags
  end
end
