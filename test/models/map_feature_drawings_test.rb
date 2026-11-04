require "test_helper"

class MapFeatureDrawingsTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def square = { "type" => "Polygon", "coordinates" => [ [ [ 4.905, 50.34 ], [ 4.906, 50.34 ], [ 4.906, 50.341 ], [ 4.905, 50.34 ] ] ] }

  test "free zones and lines live in the « Dessins » layer" do
    zone = @map.features.create!(layer: "drawings", kind: "zone", geometry: square)
    assert_equal "drawings", zone.layer
    assert_equal "Dessins", I18n.t("editor.layers.drawings")
  end

  test "a client that still sends a zone or a line to the notes layer is redirected to « Dessins »" do
    zone = @map.features.create!(layer: "notes", kind: "zone", geometry: square)
    line = @map.features.create!(layer: "notes", kind: "line", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.34 ], [ 4.906, 50.341 ] ] })
    note = @map.features.create!(layer: "notes", kind: "note_point", geometry: point)
    assert_equal %w[drawings drawings notes], [ zone, line, note ].map(&:layer)
  end

  test "a zone of the existing layer stays there" do
    assert_equal "existing", @map.features.create!(layer: "existing", kind: "zone", geometry: square).layer
  end

  test "drawings are never « En projet » nor « À retirer »" do
    assert_not MapFeature.plannable?("drawings", "zone")
    assert_not MapFeature.removable?("drawings", "line")
  end
end
