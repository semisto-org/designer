require "test_helper"
require Rails.root.join("db/migrate/20261017190000_mark_proposals_as_planned")

class MarkProposalsAsPlannedTest < ActiveSupport::TestCase
  POINT = { "type" => "Point", "coordinates" => [4.9051, 50.3401] }.freeze
  LINE = { "type" => "LineString", "coordinates" => [[4.9051, 50.3401], [4.9052, 50.3402]] }.freeze

  setup do
    @map = maps(:ahinvaux)
  end

  test "marks the elements named as a proposal as planned, and only them" do
    pond = map_features(:pond)
    pond.update_columns(name: "Proposition — Mare de tête ouest")
    hedge = feature("structures", "hedge", "proposition : haie brise-vent", LINE)
    plant = feature("plants", "plant", "Proposition — Noyer", POINT)
    existing = feature("existing", "existing_tree", "Proposition — vieux chêne", POINT)
    hedgerow = feature("structures", "hedge", "Haie champêtre", LINE)

    assert_changes -> { pond.reload.lock_version } do
      MarkProposalsAsPlanned.new.up
    end

    assert_equal true, pond.reload.properties["planned"]
    assert_equal true, hedge.reload.properties["planned"]
    [plant, existing, hedgerow].each { |f| assert_nil f.reload.properties["planned"], f.name }
    assert_equal "Proposition — Mare de tête ouest", pond.name

    MarkProposalsAsPlanned.new.down
    assert_nil pond.reload.properties["planned"]
  end

  private

  def feature(layer, kind, name, geometry)
    MapFeature.create!(map: @map, layer:, kind:, name:, geometry:)
  end
end
