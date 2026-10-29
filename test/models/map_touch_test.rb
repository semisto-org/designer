require "test_helper"

# SEMISTO-DESIGNER-11: drawing on a map touches it, and that touch went through
# optimistic locking, so a feature saved against an in-memory map that another
# request had touched meanwhile failed with StaleObjectError (HTTP 409).
class MapTouchTest < ActiveSupport::TestCase
  test "a feature saves even when its in-memory map is stale" do
    map = maps(:ahinvaux)
    Map.find(map.id).touch # another request, between loading the map and saving

    feature = map.features.new(layer: "notes", kind: "note", name: "Gel au creux",
                               geometry: RGeo::Cartesian.preferred_factory(srid: 4326).point(4.95, 50.32))
    assert feature.save
    assert feature.persisted?
  end

  test "touching a map dates it without counting as an edit of the map" do
    map = maps(:ahinvaux)
    version = map.lock_version
    before = map.updated_at

    travel 1.minute do
      Map.find(map.id).touch
      map.touch
    end

    map.reload
    assert_equal version, map.lock_version
    assert_operator map.updated_at, :>, before
    assert map.update(name: "Renommée"), "renaming after a touch keeps working"
  end
end
