require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

class Maps::PublicationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @map.region.layers.create!(key: "ortho", name: "Orthophoto", url: "https://example.org/wms", kind: "wms", category: "base", layers: "O")
    @map.region.layers.create!(key: "gaz", name: "Gaz", url: "https://example.org/wms", kind: "wms", group_name: "Réseaux")
  end

  test "owner only: viewers and editors are refused, outsiders get a 404" do
    editor = add_member(@map, make_user("Edith"), "editor")
    [ users(:alice), editor ].each do |user|
      sign_in_as user
      get map_publication_path(@map), as: :json
      assert_response :forbidden
      post map_publication_path(@map), params: { publication: { title: "x" } }, as: :json
      assert_response :forbidden
      delete map_publication_path(@map), as: :json
      assert_response :forbidden
    end
    sign_in_as users(:bob)
    post map_publication_path(@map), params: { publication: { title: "x" } }, as: :json
    assert_response :not_found
    assert_nil @map.reload.publication
  end

  test "show lists the options available before anything is published" do
    sign_in_as @owner
    get map_publication_path(@map), as: :json
    assert_response :success
    assert_nil json["publication"]
    assert_equal "Domaine d'Ahinvaux", json["defaults"]["title"]
    assert_equal true, json["defaults"]["options"]["hide_networks"]
    assert_equal MapFeature::LAYERS, json["featureLayers"].map { |l| l["key"] }
    assert_equal({ "ortho" => false, "gaz" => true }, json["regionLayers"].to_h { |l| [ l["key"], l["sensitive"] ] })
  end

  test "publish, refresh, renew the address, unpublish" do
    sign_in_as @owner
    post map_publication_path(@map), params: { publication: {
      title: "Mon projet", description: "Pour le client",
      options: { feature_layers: %w[plants water], region_layers: %w[ortho gaz], hide_networks: true, hide_address: true }
    } }, as: :json
    assert_response :success
    publication = @map.reload.publication
    assert publication.live?
    assert_equal "Mon projet", json["publication"]["title"]
    assert_equal "http://www.example.com/p/#{publication.token}", json["publication"]["url"]
    assert_equal %w[plants water], publication.options["feature_layers"]
    assert_equal %w[ortho], publication.snapshot["region_layer_keys"], "the gas network layer is filtered out"
    assert_equal 1, publication.version

    @map.features.create!(layer: "plants", kind: "tree", name: "Nouveau", geometry: point, created_by: @owner)
    get map_publication_path(@map), as: :json
    assert_equal true, json["publication"]["stale"]

    patch map_publication_path(@map), params: { publication: { title: "Mon projet", options: { feature_layers: %w[plants] } } }, as: :json
    assert_response :success
    assert_equal 2, @map.reload.publication.version
    assert_equal false, json["publication"]["stale"]
    assert_equal publication.token, @map.publication.token

    old = publication.token
    post renew_map_publication_path(@map), as: :json
    assert_not_equal old, @map.reload.publication.token

    delete map_publication_path(@map), as: :json
    assert_response :success
    assert_equal false, json["publication"]["live"]
    assert_not @map.reload.publication.live?
  end

  test "publishing without a title uses the map's name; a too long title is a 422" do
    sign_in_as @owner
    post map_publication_path(@map), as: :json
    assert_response :success
    assert_equal @map.name, @map.reload.publication.title
    patch map_publication_path(@map), params: { publication: { title: "x" * 200 } }, as: :json
    assert_response :unprocessable_entity
    assert json["message"].present?
  end

  test "update, renew and unpublish need an existing publication" do
    sign_in_as @owner
    patch map_publication_path(@map), as: :json
    assert_response :not_found
    post renew_map_publication_path(@map), as: :json
    assert_response :not_found
  end
end
