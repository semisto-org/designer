require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class PhotoRenderingTest < ActiveSupport::TestCase
  include SoilPhotosHelper
  include ActiveJob::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @photo = create_photo(location: MapPhoto.point_from(4.9, 50.3), location_source: "exif", heading: 120)
    @sketch = @photo.sketches.create!(name: "Mares", strokes: [ { "type" => "line", "color" => "#ffffff", "width" => 0.006, "points" => [ [ 0.1, 0.2 ], [ 0.3, 0.4 ] ] } ])
  end

  def build(**attrs)
    rendering = @photo.renderings.new(style: "watercolor", sketch: @sketch, requested_by: users(:michael), **attrs)
    rendering.input.attach(io: file_fixture("terrain.jpg").open, filename: "in.jpg", content_type: "image/jpeg")
    rendering
  end

  test "a rendering takes its map from the photo and starts its job" do
    rendering = build
    assert_enqueued_with(job: PhotoRenderingJob) { rendering.save! }
    assert_equal @map, rendering.map
    assert_equal "queued", rendering.status
  end

  test "style, input and sketch are checked" do
    refute build(style: "oil").valid?
    rendering = @photo.renderings.new(style: "photo")
    refute rendering.valid?
    assert rendering.errors.key?(:input)
    other = create_photo(salt: "other")
    refute build(sketch: other.sketches.create!(name: "Ailleurs", strokes: [])).valid?
    refute build(instructions: "x" * 501).valid?
  end

  test "the prompt asks to realise the drawing, quotes the person and forbids invented notes" do
    prompt = build(instructions: "orange = sentier").prompt
    assert_includes prompt, "hand-drawn over it"
    assert_includes prompt, "«orange = sentier»"
    assert_includes prompt, "watercolour"
    assert_includes prompt, "Do not add any text, label"
    alone = build(sketch: nil, style: "pencil").prompt
    refute_includes alone, "hand-drawn"
    assert_includes alone, "graphite pencil"
  end

  test "the monthly quota counts the owner's renderings on all their maps, failures aside" do
    owner = @map.owner
    assert_equal PhotoRendering::MONTHLY_LIMIT, PhotoRendering.remaining_this_month(owner)
    build.save!
    build.tap(&:save!).fail!("timeout")
    travel_to(2.months.ago) { build.save! }
    assert_equal 1, PhotoRendering.used_this_month(owner)
    assert_equal PhotoRendering::MONTHLY_LIMIT - 1, PhotoRendering.remaining_this_month(owner)
  end

  test "a finished image becomes a photo at the same place, linked to its source" do
    rendering = build(instructions: "orange = sentier").tap(&:save!)
    rendering.complete!(StringIO.new(file_fixture("terrain_later.jpg").binread), content_type: "image/jpeg")

    result = rendering.reload.result_photo
    assert_equal "done", rendering.status
    assert_equal @photo, result.derived_from
    assert_equal "watercolor", result.rendering_style
    assert_equal "ai", result.source
    assert_equal [ @photo.lng, @photo.lat, @photo.heading ], [ result.lng, result.lat, result.heading ]
    assert_equal "Mise en image (aquarelle) de l'esquisse « Mares »", result.caption
    assert_equal @photo.id, result.as_inertia[:derivedFromId]
  end

  test "deleting the source photo keeps the painted one" do
    rendering = build.tap(&:save!)
    rendering.complete!(StringIO.new(file_fixture("terrain_later.jpg").binread), content_type: "image/jpeg")
    result = rendering.result_photo
    @photo.destroy!
    assert_nil result.reload.derived_from_id
    assert_raises(ActiveRecord::RecordNotFound) { rendering.reload }
  end
end
