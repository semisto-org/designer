require "test_helper"

class Admin::MapsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @map = maps(:ahinvaux)
  end

  def props = response.parsed_body["props"]

  test "regular users get a 404" do
    sign_in_as users(:michael)
    get admin_maps_path
    assert_response :not_found
  end

  test "lists every map with its figures" do
    @map.palette_items.create!(species: plant_species(:apple))
    @map.palette_items.create!(species: plant_species(:alder))
    2.times { |i| @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.905 + i * 0.0001)) }
    @map.features.create!(layer: "plants", kind: "patch", geometry: square(lng: 4.906))
    @map.features.create!(layer: "notes", kind: "note", status: "draft", source: "ai", geometry: point)
    Comment.create!(commentable: @map, author: users(:alice), body: "Bravo")
    Comment.create!(commentable: @map, author: users(:alice), body: "Effacé", deleted_at: Time.current)
    AiAction.create!(user: users(:michael), map: @map, tool: "list_features", client_name: "Claude")
    other = Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia), archived_at: 1.day.ago)

    sign_in_as @admin
    get admin_maps_path, headers: inertia_headers
    assert_response :success
    assert_equal Map.count, props["maps"].size

    row = props["maps"].find { |map| map["id"] == @map.id }
    expected_features = @map.features.active.count
    assert_equal({ "palette" => 2, "plants" => 2, "patches" => 1, "features" => expected_features, "drafts" => 1,
                   "editors" => 0, "viewers" => 1, "comments" => 1, "photos" => 0, "planImages" => 0, "aiActions" => 1 },
                 row["counts"])
    assert_equal "michael@example.org", row["owner"]["email"]
    assert_equal "free", row["owner"]["plan"]
    assert_equal "design", row["stage"]
    assert_not row["archived"]
    assert_not row["published"]
    assert_operator Time.iso8601(row["lastActivityAt"]), :>=, @map.reload.updated_at.change(usec: 0)

    bob = props["maps"].find { |map| map["id"] == other.id }
    assert bob["archived"]
    assert_equal 0, bob["counts"]["palette"]
  end
end
