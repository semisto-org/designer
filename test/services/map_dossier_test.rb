require "test_helper"
require_relative "../test_helpers/climate_test_helper"
require_relative "../test_helpers/soil_photos_helper"

class MapDossierTest < ActiveSupport::TestCase
  include ClimateTestHelper
  include SoilPhotosHelper

  setup do
    seed_climate!
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @viewer = users(:alice)
  end

  def dossier(user: @owner, **options) = MapDossier.new(@map.reload, user:, **options).as_json

  def network!(status: "active")
    @map.features.create!(layer: "networks", kind: "water_pipe", name: "Arrivée d'eau", status:,
                          geometry: { "type" => "LineString", "coordinates" => [ [ 4.904, 50.340 ], [ 4.906, 50.341 ] ] })
  end

  def cover_ids(json) = json[:cover][:features][:features].map { |f| f[:id] }

  test "gathers the map, its cover and the project sheet" do
    @map.update!(address: "Rue du Bois 1, 5530 Yvoir", parcels: [ "91001A0123/00B000" ],
                 project: { "who" => { "profile" => "individual" }, "ambitions" => { "goals" => %w[food_autonomy biodiversity] } })
    json = dossier

    assert_equal "Domaine d'Ahinvaux", json[:map][:name]
    assert_equal "Michael", json[:map][:ownerName]
    assert_equal [ "91001A0123/00B000" ], json[:map][:parcels]
    assert_equal "MultiPolygon", json[:cover][:boundary]["type"]
    assert_equal 4, json[:cover][:bbox].size
    assert_includes cover_ids(json), map_features(:pond).id
    assert_equal %w[food_autonomy biodiversity], json[:project][:values].dig("ambitions", "goals")
    assert_not json[:project][:values].key?("meta")
    assert json[:project][:schema][:sections].any? { |s| s[:key] == "who" }
    assert_equal({ role: "owner", canEdit: true }, json[:viewer])
  end

  test "terrain: perimeter and a point inside the boundary for the region layers" do
    json = dossier
    terrain = json[:terrain]
    assert_in_delta 2 * (640 + 445), terrain[:perimeterM], 40
    assert @map.boundary.contains?(GeoJsonGeometry::FACTORY.point(terrain[:point][:lng], terrain[:point][:lat]))
    assert_nil terrain[:identify], "no identifiable layer in this region"
  end

  test "the cover's base is the region's default aerial photo, cited in the sources" do
    region = regions(:wallonia)
    region.layers.create!(key: "ortho", name: "Photo 2026", category: "base", kind: "wms", url: "https://geoservices.example/ortho",
                          layers: "0", attribution: "© SPW – <a href=\"https://geoportail.wallonie.be\">Géoportail</a>",
                          proxied: true, enabled: true, options: { "default" => true })
    region.layers.create!(key: "cadastre", name: "Plan cadastral", category: "overlay", kind: "wms", url: "https://geoservices.example/cadmap",
                          layers: "0", attribution: "© SPW", identify_url: "https://geoservices.example/cadmap/identify",
                          proxied: true, enabled: true, options: { "role" => "cadastre" })
    json = dossier

    assert_equal "ortho", json[:cover][:base][:key]
    assert_match %r{\A/regions/#{region.id}/layers/ortho/tiles/\{z\}/\{x\}/\{y\}}, json[:cover][:base][:tileUrl]
    assert_equal "© SPW – Géoportail", json[:cover][:base][:attribution], "attributions are plain text on paper"
    assert_equal "cadastre", json[:cover][:cadastre][:key]
    assert_equal [ "cadastre" ], json[:terrain][:identify][:layers].map { |l| l[:key] }
    assert_equal 18, json[:terrain][:identify][:zoom]
    assert json[:sources].any? { |s| s[:section] == "cover" && s[:label] == "© SPW – Géoportail" }
    assert json[:sources].any? { |s| s[:section] == "terrain" && s[:kind] == "layers" && s[:detail] == "Plan cadastral" }
  end

  test "sensitive networks stay out unless an owner or editor asks for them" do
    pipe = network!
    assert_not_includes cover_ids(dossier), pipe.id
    assert_equal 1, dossier[:networks][:count]

    with_networks = dossier(include_networks: true)
    assert with_networks[:networks][:included]
    assert_includes cover_ids(with_networks), pipe.id
    assert_includes with_networks[:design][:layers].map { |l| l[:layer] }, "networks"

    viewer = dossier(user: @viewer, include_networks: true)
    assert_not viewer[:networks][:included], "a viewer cannot include networks"
    assert_equal 0, viewer[:networks][:count], "a viewer is not even told how many there are"
    assert_not_includes cover_ids(viewer), pipe.id
    assert_not_includes viewer[:design][:layers].map { |l| l[:layer] }, "networks"
  end

  test "AI drafts and rejected proposals never reach the dossier, nor their alerts" do
    regions(:wallonia).update!(settings: regions(:wallonia).settings.merge("regulatory_rules" => [
      { "key" => "pond_max_area", "check" => "max_area", "kinds" => %w[pond], "max_m2" => 100, "severity" => "warning",
        "source" => { "label" => "SPW Territoire", "url" => "https://territoire.example/codt.pdf" } }
    ]))
    draft = @map.features.create!(layer: "water", kind: "pond", status: "draft", source: "ai",
                                  geometry: square(lng: 4.908, lat: 50.341, size: 0.0005))
    rejected = @map.features.create!(layer: "structures", kind: "shed", status: "rejected", geometry: square(lng: 4.909, lat: 50.341, size: 0.0001))
    json = dossier

    assert_not_includes cover_ids(json), draft.id
    assert_not_includes cover_ids(json), rejected.id
    flagged = json[:alerts][:regulatory][:alerts].flat_map { |a| a[:featureIds] }
    assert_includes flagged, map_features(:pond).id, "the 316 m² pond of the fixtures is flagged"
    assert_not_includes flagged, draft.id
    source = json[:sources].find { |s| s[:section] == "alerts" }
    assert_equal "SPW Territoire", source[:label]
    assert_equal "https://territoire.example/codt.pdf", source[:url]
  end

  test "design: elements per layer and kind, measured, plants summarised, notes left out" do
    @map.features.create!(layer: "structures", kind: "hedge", name: "Haie nord", properties: { "rows" => 2, "spacing_m" => 1 },
                          geometry: { "type" => "LineString", "coordinates" => [ [ 4.904, 50.342 ], [ 4.905, 50.342 ] ] })
    @map.features.create!(layer: "plants", kind: "patch", geometry: square(lng: 4.904, lat: 50.3395, size: 0.0002))
    @map.features.create!(layer: "notes", kind: "note_point", name: "Voir avec le voisin", geometry: point(lng: 4.905, lat: 50.341))
    layers = dossier[:design][:layers]

    assert_equal %w[water structures plants], layers.map { |l| l[:layer] }
    pond = layers.first[:kinds].first
    assert_equal "pond", pond[:kind]
    assert_in_delta 316, pond[:areaM2], 25
    assert_equal "Mare du verger", pond[:items].first[:name]
    kinds = layers.flat_map { |l| l[:kinds] }.index_by { |k| k[:kind] }
    assert_in_delta 71, kinds["hedge"][:lengthM], 2
    assert_equal 1, kinds["hedge"][:items].size
    assert_empty kinds["patch"][:items], "plants and patches are detailed in the plant list"
    assert kinds["patch"][:areaM2].positive?
  end

  test "plant list: rows with the source of their spread, PFAF cited as PFAF" do
    apple = plant_species(:apple)
    apple.record_provenance!(%w[spread_min_m spread_max_m], source: "pfaf", status: "to_verify")
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906, lat: 50.341), properties: { "species_id" => apple.id })
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.907, lat: 50.341), properties: { "species_id" => plant_species(:comfrey).id })
    json = dossier

    rows = json[:plants][:rows].index_by { |r| r[:latinName] }
    assert_equal "pfaf", rows["Malus domestica"][:spreadSource]
    assert_equal "catalogue", rows["Symphytum officinale"][:spreadSource], "a value without recorded provenance"
    assert_equal 2, json[:plants][:total]
    pfaf = json[:sources].find { |s| s[:key] == "plants-pfaf" }
    assert_equal "PFAF, usage non commercial", pfaf[:license]
    assert_includes pfaf[:detail].split(","), "spread"
    assert_includes pfaf[:detail].split(","), "hardiness", "the fixture's hardiness zone comes from PFAF too"
    crown = json[:cover][:features][:features].find { |f| f[:properties]["species_id"] == apple.id }
    assert_equal 4.0, crown[:properties]["dossierCrownM"]
    assert_equal "sub_canopy", crown[:properties]["dossierStrata"]
  end

  test "analyses are locked on a free plan: no relief, no projections, no soil reading" do
    @map.create_terrain!(status: "ready", cell_size_m: 1, metadata: { "stats" => { "z_min" => 101.2, "z_max" => 118.9, "drop" => 17.7 } })
    @map.soil_samples.create!(label: "S1", depth_from_cm: 0, depth_to_cm: 30, status: "sampled", results: { "ph_water" => "6,4" })
    json = with_plan("free") { dossier }

    assert_not json[:entitlements][:analyses]
    assert_equal({ locked: true }, json[:terrain][:relief])
    assert json[:climate][:current]["available"], "today's climate is free"
    assert json[:climate][:projections]["locked"]
    assert json[:climate][:plants]["locked"]
    sample = json[:soil][:samples].first
    assert_equal 6.4, sample[:results]["ph_water"], "figures stay visible"
    assert_nil sample[:interpretation]
    assert_not json[:sources].any? { |s| s[:key] == "relief" }
  end

  test "with analyses: relief numbers, rainwater, projections and the soil reading" do
    @map.create_terrain!(status: "ready", cell_size_m: 1, fetched_at: Time.current,
                         metadata: { "stats" => { "z_min" => 101.2, "z_max" => 118.9, "drop" => 17.7, "slope_mean_pct" => 6.1 },
                                     "sources" => { "dtm" => "SPW, MNT LiDAR 2021-2022" }, "attribution" => "© SPW" })
    @map.features.create!(layer: "structures", kind: "shed", geometry: square(lng: 4.910, lat: 50.342, size: 0.0001))
    @map.soil_samples.create!(label: "S1", depth_from_cm: 0, depth_to_cm: 30, status: "sampled", results: { "ph_water" => "6,4" })
    json = with_plan("yearly") { dossier }

    relief = json[:terrain][:relief]
    assert relief[:available]
    assert_equal 17.7, relief[:stats]["drop"]
    assert relief[:rainwater][:roofAreaM2].positive?
    assert json[:climate][:projections]["available"]
    assert_equal "ok", json[:soil][:samples].first[:interpretation][:parameters].first[:band]
    assert json[:sources].any? { |s| s[:key] == "relief" && s[:label] == "© SPW" }
    assert json[:sources].any? { |s| s[:section] == "climate" }
  end

  test "relief not imported yet says so" do
    relief = dossier[:terrain][:relief]
    assert_equal false, relief[:available]
    assert_equal "not_imported", relief[:reason]
  end

  test "photos: before / after pairs of the same spot, and a default choice" do
    before = create_photo(salt: 1, location: [ 4.9075, 50.341 ], taken_at: "2025-03-01T10:00:00", heading: 90, caption: "Avant")
    after = create_photo(salt: 2, location: [ 4.9075 + meters_east(5), 50.341 ], taken_at: "2026-06-01T10:00:00", heading: 100)
    elsewhere = create_photo(salt: 3, location: [ 4.9075 + meters_east(200), 50.341 ], taken_at: "2026-06-02T10:00:00")
    unplaced = create_photo(salt: 4)
    json = dossier[:photos]

    assert_equal 4, json[:total]
    assert_equal [ { beforeId: before.id, afterId: after.id, days: 457 } ], json[:pairs]
    assert_equal [ before.id, after.id ], json[:defaults].first(2)
    assert_equal [ before.id, after.id, elsewhere.id, unplaced.id ].sort, json[:defaults].sort
    item = json[:items].find { |p| p[:id] == before.id }
    assert_equal "/maps/#{@map.id}/photos/#{before.id}/image?size=large", item[:largeUrl]
    assert item[:dated]
  end

  test "photos facing opposite directions are not a before / after" do
    create_photo(salt: 1, location: [ 4.9075, 50.341 ], taken_at: "2025-03-01T10:00:00", heading: 0)
    create_photo(salt: 2, location: [ 4.9075, 50.341 ], taken_at: "2026-06-01T10:00:00", heading: 180)
    assert_empty dossier[:photos][:pairs]
  end

  test "finances: the key figures of a saved plan only" do
    assert_equal({ exists: false }, dossier[:finances])
    FinancialPlan.build_for(@map).save!
    json = dossier[:finances]
    assert json[:exists]
    assert json[:summary].key?("totalInvestment")
    assert json[:summary].key?("warningsCount")
  end

  test "a climate provider failure leaves the rest of the dossier intact" do
    broken = Object.new
    broken.define_singleton_method(:capabilities) { raise Faraday::TimeoutError }
    json = MapDossier.new(@map, user: @owner, climate_provider: broken).as_json
    assert_equal false, json[:climate][:current]["available"]
    assert_equal "Domaine d'Ahinvaux", json[:map][:name]
  end
end
