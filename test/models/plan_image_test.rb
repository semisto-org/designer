require "test_helper"

class PlanImageTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def build(file: "terrain.jpg", type: "image/jpeg", **attrs)
    plan_image = @map.plan_images.new(name: "Esquisse", center_lng: 4.9, center_lat: 50.34, width_m: 40, aspect: 1.5, **attrs)
    plan_image.image.attach(io: file_fixture(file).open, filename: file, content_type: type)
    plan_image
  end

  test "a plan image is posed by its center, width, rotation and aspect" do
    plan_image = build(rotation: 375)
    assert plan_image.save
    assert_equal 15.0, plan_image.rotation
    assert_equal 0.7, plan_image.opacity
    assert plan_image.visible
  end

  test "each new image goes on top of the others" do
    first = build.tap(&:save!)
    second = build(name: "Version client").tap(&:save!)
    assert_operator second.position, :>, first.position
    assert_equal [ first, second ], @map.plan_images.reload.to_a
  end

  test "only images are accepted" do
    plan_image = build(file: "rapport_labo.pdf", type: "application/pdf")
    assert_not plan_image.valid?
    assert_equal [ "Image doit être une image JPEG, PNG ou WebP" ], plan_image.errors.full_messages
  end

  test "an image is required, and a sensible pose" do
    plan_image = @map.plan_images.new(name: "Esquisse", center_lng: 4.9, center_lat: 50.34, width_m: 0, aspect: 100, opacity: 2)
    assert_not plan_image.valid?
    assert plan_image.errors.of_kind?(:image, :blank)
    assert plan_image.errors.key?(:width_m)
    assert plan_image.errors.key?(:aspect)
    assert plan_image.errors.key?(:opacity)
  end

  test "it leaves with its map" do
    build.save!
    assert_difference -> { PlanImage.count }, -1 do
      @map.destroy
    end
  end
end
