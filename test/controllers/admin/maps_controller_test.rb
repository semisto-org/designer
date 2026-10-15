require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Admin::MapsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

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

  test "adds up the space taken by the photos and the documents of each map" do
    photo = create_photo
    variant = photo.image.variant(:thumb).processed
    PlantObservation.new(map_feature: @map.features.create!(layer: "plants", kind: "plant", geometry: point), user: users(:michael),
                     observed_on: Date.current - 1, survival: PlantObservation::SURVIVALS.first)
      .tap { |o| o.photo.attach(io: StringIO.new("x" * 300), filename: "plant.jpg", content_type: "image/jpeg") }.save!
    document = @map.documents.new(uploaded_by: users(:michael), title: "Plan")
    document.file.attach(io: StringIO.new("y" * 1_000), filename: "plan.txt", content_type: "text/plain")
    document.save!
    sample = @map.soil_samples.create!(label: "A")
    sample.lab_reports.attach(io: StringIO.new("z" * 2_000), filename: "labo.pdf", content_type: "application/pdf")
    other = Map.create!(name: "Jardin de Bob", owner: users(:bob), region: regions(:wallonia))

    sign_in_as @admin
    get admin_maps_path, headers: inertia_headers

    photos = photo.image.blob.byte_size + variant.image.blob.byte_size + 300
    row = props["maps"].find { |map| map["id"] == @map.id }
    assert_equal({ "photos" => photos, "documents" => 3_000 }, row["storageBytes"])
    assert_equal({ "photos" => 0, "documents" => 0 }, props["maps"].find { |map| map["id"] == other.id }["storageBytes"])
  end
end
