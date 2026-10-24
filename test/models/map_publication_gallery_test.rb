require "test_helper"
require_relative "../test_helpers/collab_test_helper"

# « Carnets ouverts »: only maps their owner offered, and that Semisto chose.
class MapPublicationGalleryTest < ActiveSupport::TestCase
  include CollabTestHelper

  setup do
    @map = maps(:ahinvaux)
    with_feature(@map, layer: "plants", kind: "tree", name: "Pommier")
  end

  def publish(map = @map, in_gallery: true)
    MapPublication.publish!(map, by: map.owner, options: { "in_gallery" => in_gallery })
  end

  test "the owner's consent is off unless asked, and kept as a publication option" do
    assert_equal false, MapPublication.normalize_options(nil, @map)["in_gallery"]
    assert publish.offered_to_gallery?
    assert_not publish(in_gallery: false).offered_to_gallery?
  end

  test "the gallery shows only offered, live publications that Semisto chose, in its order" do
    first = publish
    assert_empty MapPublication.in_gallery, "offered is not enough: Semisto chooses"

    other = Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia), boundary: @map.boundary)
    second = publish(other)
    second.choose_for_gallery!
    first.choose_for_gallery!
    assert_equal [ second, first ], MapPublication.in_gallery.to_a

    first.unpublish!
    assert_equal [ second ], MapPublication.in_gallery.to_a, "an unpublished map leaves the gallery"

    publish(other, in_gallery: false)
    assert_empty MapPublication.in_gallery, "withdrawing consent takes it out at once"
  end

  test "an archived map leaves the gallery" do
    publish.choose_for_gallery!
    @map.update!(archived_at: Time.current)
    assert_empty MapPublication.in_gallery
  end

  test "the visit is the publication chosen for it, else the first of the gallery" do
    assert_nil MapPublication.site_tour
    first = publish
    first.choose_for_gallery!
    assert_equal first, MapPublication.site_tour

    other = Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia), boundary: @map.boundary)
    second = publish(other)
    second.choose_for_tour!
    assert second.reload.gallery_position, "the visit is also in the gallery"
    assert_equal second, MapPublication.site_tour

    first.choose_for_tour!
    assert_not second.reload.site_tour, "only one visit at a time"
    first.remove_from_gallery!
    assert_not first.reload.site_tour
    assert_equal second, MapPublication.site_tour
  end

  test "a gallery card says where, how big and how old, from the snapshot only" do
    card = publish.as_gallery_card
    assert_equal "/p/#{@map.publication.token}", card[:path]
    assert_equal "Wallonie", card[:regionName]
    assert_equal "MultiPolygon", card[:boundary]["type"]
    assert_nil card[:locality], "the address stays hidden by default"
    assert_kind_of Integer, card[:plants]
  end
end
