require "test_helper"

class MapVignetteTest < ActiveSupport::TestCase
  test "paints a place with an outline as a PNG for e-mails" do
    png = MapVignette.png(maps(:ahinvaux))
    assert png.start_with?("\x89PNG".b)
    image = Vips::Image.new_from_buffer(png, "")
    assert_equal [ MapVignette::WIDTH, MapVignette::HEIGHT ], [ image.width, image.height ]
  end

  test "a place without an outline has no vignette" do
    map = Map.create!(name: "Sans contour", owner: users(:bob), region: regions(:wallonia))
    assert_nil MapVignette.png(map)
  end

  test "an image that cannot be made never stops the e-mail" do
    vignette = MapVignette.new(maps(:ahinvaux))
    vignette.define_singleton_method(:draw) { raise Vips::Error, "boom" }
    assert_nil vignette.png
  end
end
