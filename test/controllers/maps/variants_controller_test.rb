require "test_helper"

class Maps::VariantsControllerTest < ActionDispatch::IntegrationTest
  POINT = { "type" => "Point", "coordinates" => [ 4.907, 50.341 ] }.freeze
  SHAPE = { "type" => "Polygon", "coordinates" => [ [ [ 4.907, 50.341 ], [ 4.9072, 50.341 ], [ 4.9072, 50.3412 ], [ 4.907, 50.341 ] ] ] }.freeze

  setup do
    @map = maps(:ahinvaux)
  end

  test "the first new variant turns the project into « Projet 1 » and opens « Projet 2 »" do
    sign_in_as users(:michael)
    post map_variants_path(@map), as: :json
    assert_response :created
    variants = response.parsed_body["variants"]
    assert_equal [ "Projet 1", "Projet 2" ], variants.map { _1["name"] }
    assert_equal [ true, false ], variants.map { _1["retained"] }
    assert_equal variants.last["id"], response.parsed_body["id"]
  end

  test "an editor renames, writes the idea, retains" do
    sign_in_as users(:michael)
    one = @map.variants.create!(name: "Projet 1")
    two = @map.variants.create!(name: "Projet 2")
    patch map_variant_path(@map, two), params: { variant: { name: "Mare en bas", notes: "Plus d'ombre l'été", retained: true } }, as: :json
    assert_response :success
    assert_equal "Mare en bas", two.reload.name
    assert two.retained?
    assert_not one.reload.retained?
  end

  test "a tag becomes a variant with its planned elements" do
    sign_in_as users(:michael)
    tagged = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true }, tags: [ "Version A" ])
    on_ground = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, tags: [ "Version A" ])
    post map_variants_path(@map), params: { from_tag: "version a" }, as: :json
    assert_response :created
    assert_equal [ "version a" ], response.parsed_body["variants"].map { _1["name"] }
    assert_equal response.parsed_body["id"], tagged.reload.variant_id
    assert_nil on_ground.reload.variant_id
  end

  test "duplicate returns the copied elements; delete returns the trashed ones" do
    sign_in_as users(:michael)
    one = @map.variants.create!(name: "Projet 1")
    own = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true }, variant: one)
    post duplicate_map_variant_path(@map, one), as: :json
    assert_response :created
    assert_equal "Projet 1 (copie)", response.parsed_body["variants"].last["name"]
    assert_equal 1, response.parsed_body["features"].size
    delete map_variant_path(@map, one), as: :json
    assert_response :success
    assert_equal [ own.id ], response.parsed_body["trashed"]
    assert_equal [ true ], response.parsed_body["variants"].map { _1["retained"] }
  end

  test "a feature is moved into a variant through the features endpoint" do
    sign_in_as users(:michael)
    one = @map.variants.create!(name: "Projet 1")
    pond = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true })
    patch map_feature_path(@map, pond), params: { feature: { variant_id: one.id, lock_version: pond.lock_version } }, as: :json
    assert_response :success
    assert_equal one.id, pond.reload.variant_id
    assert_equal one.id, response.parsed_body["properties"]["variant_id"]
  end

  test "a viewer reads the variants but changes nothing" do
    @map.variants.create!(name: "Projet 1")
    sign_in_as users(:alice)
    get map_variants_path(@map), as: :json
    assert_response :success
    assert_equal [ "Projet 1" ], response.parsed_body["variants"].map { _1["name"] }
    post map_variants_path(@map), as: :json
    assert_response :forbidden
  end
end
