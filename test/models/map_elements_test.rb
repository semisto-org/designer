require "test_helper"

class MapElementsTest < ActiveSupport::TestCase
  def feature(**attrs)
    maps(:ahinvaux).features.new({ layer: "water", kind: "pond", geometry: square(size: 0.0001) }.merge(attrs))
  end

  test "the library covers every design layer but plants, with unique kinds" do
    assert_equal %w[existing water access structures animals networks notes], MapElements.layers
    assert_empty MapElements.kinds_for("plants")
    assert_includes MapElements.kinds_for("water"), "pond"
    assert_includes MapElements.kinds_for("networks"), "water_pipe"
    assert_equal "water", MapElements.find("swale").layer
  end

  test "every kind, field and option has a French label" do
    MapElements.elements.each_value do |element|
      assert I18n.exists?("editor.kinds.#{element.kind}", :fr), "missing label for #{element.kind}"
      element.fields.each do |field|
        assert I18n.exists?("drawing.fields.#{field.key}", :fr), "missing field label #{field.key}"
        field.options.each do |option|
          assert I18n.exists?("drawing.options.#{field.key}.#{option}", :fr), "missing option label #{field.key}.#{option}"
        end
      end
    end
  end

  test "every kind has a geometry, an icon and a colour, and valid defaults" do
    MapElements.catalog["layers"].each do |layer, config|
      assert_match(/\A#\h{6}\z/, config["color"], layer)
      config["elements"].each do |kind, spec|
        assert spec["icon"].present?, kind
        assert_match(/\A#\h{6}\z/, spec["color"], kind)
        Array(spec["geometry"]).each { |g| assert_includes %w[Point LineString Polygon], g }
        geometry = { "Point" => point, "LineString" => { "type" => "LineString", "coordinates" => [ [ 4.9, 50.34 ], [ 4.9001, 50.3401 ] ] }, "Polygon" => square(size: 0.0001) }[Array(spec["geometry"]).first]
        record = maps(:ahinvaux).features.new(layer:, kind:, geometry:)
        assert record.valid?, "#{kind}: #{record.errors.full_messages.to_sentence}"
      end
    end
  end

  test "a known kind gets its default properties on creation" do
    pond = feature
    assert pond.save
    assert_equal 1, pond.properties["depth_m"]
    assert_equal "wildlife", pond.properties["purpose"]

    custom = feature(properties: { "depth_m" => 2.5 })
    custom.save!
    assert_equal 2.5, custom.properties["depth_m"]
  end

  test "a known kind must keep its layer and geometry type" do
    misplaced = feature(layer: "structures")
    assert_not misplaced.valid?
    assert misplaced.errors.of_kind?(:base, :element_layer)
    assert_includes misplaced.errors.full_messages.to_sentence, "couche « Eau »"

    as_point = feature(geometry: point)
    assert_not as_point.valid?
    assert as_point.errors.of_kind?(:base, :element_geometry)
    assert_includes as_point.errors.full_messages.to_sentence, "une surface"
  end

  test "properties are checked against the kind's fields" do
    assert_not feature(properties: { "depth_m" => 12 }).valid?
    assert_not feature(properties: { "depth_m" => "deep" }).valid?
    assert_not feature(properties: { "liner" => "concrete" }).valid?
    assert feature(properties: { "liner" => "epdm", "depth_m" => 0.8, "free_note" => "kept" }).valid?
    assert feature(properties: { "depth_m" => nil }).valid?

    paddock = maps(:ahinvaux).features.new(layer: "animals", kind: "paddock", geometry: square, properties: { "headcount" => 2.5 })
    assert_not paddock.valid?
    assert_includes paddock.errors.full_messages.to_sentence, "Effectif"

    tree = maps(:ahinvaux).features.new(layer: "existing", kind: "existing_tree", geometry: point, properties: { "keep" => "yes" })
    assert_not tree.valid?
  end

  test "measures accept lines and areas" do
    line = { "type" => "LineString", "coordinates" => [ [ 4.9, 50.34 ], [ 4.901, 50.34 ] ] }
    assert maps(:ahinvaux).features.new(layer: "notes", kind: "measure", geometry: line, properties: { "length_m" => 71.2 }).valid?
    assert maps(:ahinvaux).features.new(layer: "notes", kind: "measure", geometry: square).valid?
  end

  test "kinds owned by other modules pass through, if well formed" do
    assert maps(:ahinvaux).features.new(layer: "plants", kind: "patch", geometry: square).valid?
    assert maps(:ahinvaux).features.new(layer: "existing", kind: "zone", geometry: square).valid?
    bad = maps(:ahinvaux).features.new(layer: "plants", kind: "Not a kind!", geometry: square)
    assert_not bad.valid?
    assert bad.errors.of_kind?(:base, :element_kind_format)
  end
end
