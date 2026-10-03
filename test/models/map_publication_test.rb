require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class MapPublicationTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @map.update!(address: "Rue du Verger 12, 5530 Yvoir", parcels: [ "91005A0012/00B000" ])
    @tree = with_feature(@map, layer: "plants", kind: "tree", name: "Noyer")
    @pipe = with_feature(@map, layer: "networks", kind: "line", name: "Conduite d'eau de M. Dupont",
                         geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.340 ], [ 4.906, 50.341 ] ] })
    @draft = with_feature(@map, name: "Brouillon IA").tap { |f| f.update!(status: "draft") }
    @rejected = with_feature(@map, name: "Refusé").tap { |f| f.update!(status: "rejected") }
    @tree.update!(notes: "Code du compteur: 4821", properties: { "secret" => "x" })
  end

  def publish(**attrs)
    MapPublication.publish!(@map, by: @owner, **attrs)
  end

  def names(publication) = publication.features.map { |f| f["properties"]["name"] }

  test "publishing takes a snapshot with the boundary, the active features and the map's metadata" do
    publication = publish(title: "Le jardin d'Ahinvaux", description: "Projet 2026")
    assert publication.live?
    assert_equal 1, publication.version
    assert_match(/\Ale-jardin-d-ahinvaux-[a-z0-9]{14}\z/, publication.token)
    assert_equal "MultiPolygon", publication.snapshot["map"]["boundary"]["type"]
    assert_equal [ "Mare du verger", "Noyer" ].sort, names(publication).sort
    assert_equal "wallonia", publication.snapshot["map"]["region"]["key"]
    assert publication.snapshot["map"].key?("area_m2")
  end

  test "privacy: networks are hidden by default and even a listed layer cannot leak them" do
    publication = publish
    assert_not_includes names(publication), "Conduite d'eau de M. Dupont"
    assert_not_includes publication.snapshot["features"].map { |f| f["properties"]["layer"] }, "networks"

    forced = publish(options: { "feature_layers" => MapFeature::LAYERS, "hide_networks" => true })
    assert_not_includes names(forced), "Conduite d'eau de M. Dupont"
    assert_not_includes forced.to_json, "Dupont"
  end

  test "networks are shown only when the owner both selects them and stops hiding them" do
    assert_includes names(publish(options: { "feature_layers" => MapFeature::LAYERS, "hide_networks" => false })), "Conduite d'eau de M. Dupont"
    assert_not_includes names(publish(options: { "feature_layers" => %w[plants], "hide_networks" => false })), "Conduite d'eau de M. Dupont"
  end

  test "privacy: address, parcels, notes, drafts, rejected elements and custom properties never enter the snapshot" do
    publication = publish
    json = publication.snapshot.to_json
    %w[Verger Yvoir 91005A0012 4821 Brouillon Refusé secret].each { |leak| assert_not_includes json, leak }
    assert_not publication.snapshot["map"].key?("address")
    assert_not publication.snapshot["map"].key?("parcels")
    assert_not_includes publication.as_public.to_json, "Rue du Verger"
    assert_not_includes json, @owner.email_address
  end

  test "address and notes are included only on request" do
    publication = publish(options: { "hide_address" => false, "show_notes" => true })
    assert_equal "Rue du Verger 12, 5530 Yvoir", publication.snapshot["map"]["address"]
    assert_equal "Rue du Verger 12, 5530 Yvoir", publication.as_public[:map][:address]
    assert_includes publication.snapshot.to_json, "4821"
  end

  test "only chosen feature layers are published; unknown layers are ignored" do
    publication = publish(options: { "feature_layers" => %w[water plants bogus] })
    assert_equal %w[water plants bogus] & MapFeature::LAYERS, publication.options["feature_layers"]
    publication = publish(options: { "feature_layers" => %w[water] })
    assert_equal [ "Mare du verger" ], names(publication)
  end

  test "the snapshot is frozen: later edits are not visible until published again" do
    publication = publish
    @tree.update!(name: "Noyer renommé")
    @map.features.create!(layer: "plants", kind: "tree", name: "Nouveau", geometry: point(lng: 4.906), created_by: @owner)
    assert_includes names(publication.reload), "Noyer"
    assert_not_includes names(publication), "Nouveau"
    assert publication.stale?

    again = publish
    assert_equal publication.id, again.id
    assert_equal publication.token, again.token, "same address"
    assert_equal 2, again.version
    assert_includes names(again), "Noyer renommé"
    assert_includes names(again), "Nouveau"
    assert_not again.stale?
  end

  test "unpublishing makes it not live; publishing again revives the same address" do
    publication = publish
    publication.unpublish!
    assert_not publication.live?
    assert_not publication.stale?
    token = publication.token
    assert_equal token, publish.token
    assert publication.reload.live?
  end

  test "an archived map's publication is not live" do
    publication = publish
    @map.update!(archived_at: Time.current)
    assert_not publication.reload.live?
  end

  test "renew_address! gives a new token" do
    publication = publish
    old = publication.token
    publication.renew_address!
    assert_not_equal old, publication.token
    assert_match(/\Adomaine-d-ahinvaux-/, publication.token)
  end

  test "title is required and defaults to the map name" do
    assert_equal @map.name, publish.title
    assert_equal "Autre titre", publish(title: "Autre titre").title
    assert_raises(ActiveRecord::RecordInvalid) { publish(title: "x" * 200) }
  end

  test "region layers: chosen ones only, enabled only, sensitive ones never while networks are hidden" do
    region = @map.region
    base = region.layers.create!(key: "ortho", name: "Orthophoto", url: "https://example.org/wms", kind: "wms", category: "base", layers: "ORTHO")
    cadastre = region.layers.create!(key: "cadastre", name: "Cadastre", url: "https://example.org/wms", kind: "wms", layers: "CAD")
    region.layers.create!(key: "reseaux_gaz", name: "Gaz", url: "https://example.org/wms", kind: "wms", group_name: "Réseaux")
    region.layers.create!(key: "elec", name: "Électricité", url: "https://example.org/wms", kind: "wms", options: { "sensitive" => true })
    region.layers.create!(key: "off", name: "Désactivée", url: "https://example.org/wms", kind: "wms", enabled: false)

    all = %w[ortho cadastre reseaux_gaz elec off nope]
    publication = publish(options: { "region_layers" => all })
    assert_equal %w[ortho cadastre], publication.snapshot["region_layer_keys"]
    assert_equal %w[cadastre ortho], publication.region_layers.map(&:key).sort

    shown = publish(options: { "region_layers" => all, "hide_networks" => false })
    assert_equal %w[cadastre elec ortho reseaux_gaz], shown.snapshot["region_layer_keys"].sort

    # defense in depth: a layer flagged sensitive after publication stops being served
    publication = publish(options: { "region_layers" => %w[ortho cadastre] })
    cadastre.update!(options: { "network" => true })
    assert_equal %w[ortho], publication.region_layers.map(&:key)

    # a layer disabled by the region stops being served too
    base.update!(enabled: false)
    assert_empty publication.reload.region_layers
  end

  test "as_public: tile urls point to the proxy of this publication, never to the provider" do
    @map.region.layers.create!(key: "ortho", name: "Orthophoto", url: "https://secret-provider.example/wms", kind: "wms",
                               category: "base", layers: "ORTHO", attribution: "© SPW", legend_url: "https://example.org/legend.png")
    publication = publish(options: { "region_layers" => %w[ortho] })
    data = publication.as_public
    layer = data[:layers].first
    assert_equal "#{publication.public_path}/tiles/ortho/{z}/{x}/{y}", layer[:tiles]
    assert_equal "© SPW", layer[:attribution]
    assert_not_includes data.to_json, "secret-provider"
    assert_equal "FeatureCollection", data[:features][:type]
    assert_equal 2, data[:features][:features].size
    assert_equal "Domaine d'Ahinvaux", data[:title]
  end
end
