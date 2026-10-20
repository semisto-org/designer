require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

class Admin::GalleryControllerTest < ActionDispatch::IntegrationTest
  include CollabTestHelper

  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @map = maps(:ahinvaux)
    @publication = MapPublication.publish!(@map, by: @map.owner, options: { "in_gallery" => true })
  end

  def props = response.parsed_body["props"]

  test "regular users get a 404" do
    sign_in_as users(:michael)
    get admin_gallery_index_path
    assert_response :not_found
    patch admin_gallery_path(@publication), params: { choice: "show" }
    assert_response :not_found
    assert_nil @publication.reload.gallery_position
  end

  test "lists the publications their owners offered, and only those" do
    other = Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia), boundary: @map.boundary)
    MapPublication.publish!(other, by: other.owner)
    sign_in_as @admin
    get admin_gallery_index_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/gallery/index", response.parsed_body["component"]
    rows = props["publications"]
    assert_equal [ @publication.id ], rows.map { |row| row["id"] }
    assert_equal false, rows.first["chosen"]
    assert_equal @map.owner.email_address, rows.first["ownerEmail"]
  end

  test "shows, picks for the visit, orders and hides" do
    other = Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia), boundary: @map.boundary)
    second = MapPublication.publish!(other, by: other.owner, options: { "in_gallery" => true })
    sign_in_as @admin

    patch admin_gallery_path(@publication), params: { choice: "show" }
    assert_redirected_to admin_gallery_index_path
    patch admin_gallery_path(second), params: { choice: "tour" }
    assert_equal [ @publication, second ], MapPublication.in_gallery.to_a
    assert_equal second, MapPublication.site_tour

    patch admin_gallery_path(second), params: { choice: "up" }
    assert_equal [ second, @publication ], MapPublication.in_gallery.to_a

    patch admin_gallery_path(second), params: { choice: "hide" }
    assert_equal [ @publication ], MapPublication.in_gallery.to_a
    assert_equal @publication, MapPublication.site_tour
  end

  test "a publication its owner did not offer cannot be shown" do
    @publication = MapPublication.publish!(@map, by: @map.owner, options: { "in_gallery" => false })
    sign_in_as @admin
    patch admin_gallery_path(@publication), params: { choice: "show" }
    assert_response :not_found
    assert_empty MapPublication.in_gallery
  end
end
