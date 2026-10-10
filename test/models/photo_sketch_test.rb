require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class PhotoSketchTest < ActiveSupport::TestCase
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @photo = create_photo
  end

  def line(**overrides) = { "type" => "line", "color" => "#ffffff", "width" => 0.006, "points" => [ [ 0.1, 0.2 ], [ 0.3, 0.4 ] ] }.merge(overrides)
  def note(**overrides) = { "type" => "text", "color" => "#1b1712", "size" => 0.04, "x" => 0.5, "y" => 0.5, "text" => "Mare ici" }.merge(overrides)
  def sketch(strokes) = @photo.sketches.new(name: "Idée", strokes:)

  test "lines and notes in the photo frame are kept, and the map comes from the photo" do
    sketch = sketch([ line, note ])
    assert sketch.save, sketch.errors.full_messages.to_sentence
    assert_equal @map, sketch.map
    assert_equal [ line, note ], sketch.reload.strokes
  end

  test "an empty sketch is fine" do
    assert sketch([]).valid?
  end

  test "malformed marks are refused" do
    [
      line("color" => "red"), line("width" => 2), line("points" => []), line("points" => [ [ 0.1 ] ]),
      line("points" => [ [ 5, 0.2 ] ]), line("extra" => 1), note("text" => " "), note("text" => "x" * 201),
      note("size" => "big"), { "type" => "circle" }, "line"
    ].each do |mark|
      assert_not sketch([ mark ]).valid?, "#{mark.inspect} should be refused"
    end
    assert_not sketch("nope").valid?
  end

  test "too many marks are refused" do
    assert_not sketch(Array.new(PhotoSketch::MAX_MARKS + 1) { line }).valid?
    assert_not sketch([ line("points" => Array.new(PhotoSketch::MAX_POINTS + 1) { [ 0.5, 0.5 ] }) ]).valid?
  end

  test "a photo of another map cannot carry this map's sketch" do
    other = maps(:ahinvaux).dup.tap { |m| m.assign_attributes(name: "Autre", owner: users(:bob)) }
    other.save!(validate: false)
    sketch = PhotoSketch.new(map: other, photo: @photo, name: "Idée")
    assert_not sketch.valid?
  end

  test "deleting the photo deletes its sketches" do
    sketch([ line ]).save!
    assert_difference -> { PhotoSketch.count }, -1 do
      @photo.destroy!
    end
  end
end
