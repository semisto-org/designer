require "test_helper"
require "test_helpers/territories_test_helper"

class TerritoryHydrographyTest < ActiveSupport::TestCase
  EAU = "https://geoservices.wallonie.be/arcgis/rest/services/EAU".freeze

  # Shaped like Wallonia's seed (db/seeds/01_regions.rb).
  SETTINGS = {
    "attribution" => "SPW (test)",
    "watercourses" => {
      "url" => "#{EAU}/LIDAXES/MapServer", "layers" => [ 5, 6, 7, 8, 9 ], "category_field" => "CATEG", "name_fields" => %w[NOMB NOMA], "number_field" => "NUMATLAS",
      "categories" => {
        "01" => { "key" => "category_1", "label" => "1re catégorie", "manager" => "Région wallonne (SPW)" },
        "03" => { "key" => "category_3", "label" => "3e catégorie", "manager" => "La commune" }
      }
    },
    "runoff_axes" => { "url" => "#{EAU}/LIDAXES/MapServer/1", "label" => "LIDAXES", "class_field" => "grid_code", "default_min_class" => 3,
                       "classes" => { "3" => "20 à 50 ha", "4" => "50 à 100 ha" } },
    "sub_basins" => {
      "url" => "#{EAU}/SECTEURS_PARIS_1621/MapServer/1", "label" => "secteur PARIS", "id_field" => "SECT_PARIS", "water_body_field" => "MAS_EAU_SURF",
      "sectors_url" => "#{EAU}/SECTEURS_PARIS_1621/MapServer/0", "watercourse_field" => "COURS_EAU", "outlet_field" => "REPERE_AVA",
      "outlet_x" => "X_LB72_AVAL", "outlet_y" => "Y_LB72_AVAL", "outlet_srid" => 31370
    },
    "water_bodies" => { "url" => "#{EAU}/MESU/MapServer/2", "id_field" => "ID_RW_MESU", "name_field" => "NOM_MESU", "area_field" => "AREA_KM2", "sheet_field" => "FICHE_PDF_MESU_FR" }
  }.freeze

  setup do
    region = regions(:wallonia)
    region.update!(settings: region.settings.merge("hydrography" => SETTINGS))
    @territory = make_territory(make_team("Semisto", admin: users(:michael)))
    stub_layers
  end

  def geojson(features) = { status: 200, headers: { "Content-Type" => "application/json" }, body: { type: "FeatureCollection", features: }.to_json }
  def line(*points) = { type: "LineString", coordinates: points }
  def box(west, south, east, north) = { type: "Polygon", coordinates: [ [ [ west, south ], [ east, south ], [ east, north ], [ west, north ], [ west, south ] ] ] }

  # A stream of 1st category across the commune (two stretches), a 3rd
  # category brook, a runoff axis, two sub-basins (the upper one flows into
  # the lower) and one water body.
  def stub_layers
    empty = geojson([])
    stub_request(:get, %r{#{EAU}/LIDAXES/MapServer/[5789]/query}).to_return(empty)
    stub_request(:get, %r{#{EAU}/LIDAXES/MapServer/6/query}).to_return(geojson([
      { type: "Feature", properties: { CATEG: "01", NOMB: "Le", NOMA: "BOCQ", NUMATLAS: 1000 }, geometry: line([ 4.87, 50.33 ], [ 4.90, 50.33 ]) },
      { type: "Feature", properties: { CATEG: "01", NOMB: "Le", NOMA: "BOCQ", NUMATLAS: 0 }, geometry: line([ 4.90, 50.33 ], [ 4.94, 50.33 ]) }
    ]))
    stub_request(:get, %r{#{EAU}/LIDAXES/MapServer/8/query}).to_return(geojson([
      { type: "Feature", properties: { CATEG: "03", NOMB: "Ruisseau de", NOMA: "GENCE", NUMATLAS: 1002 }, geometry: line([ 4.91, 50.35 ], [ 4.91, 50.33 ]) }
    ]))
    @axes = stub_request(:get, %r{#{EAU}/LIDAXES/MapServer/1/query}).with(query: hash_including("where" => "grid_code >= 3"))
      .to_return(geojson([ { type: "Feature", properties: { grid_code: 4 }, geometry: line([ 4.89, 50.35 ], [ 4.89, 50.34 ]) } ]))
    stub_request(:get, %r{#{EAU}/SECTEURS_PARIS_1621/MapServer/1/query}).to_return(geojson([
      { type: "Feature", properties: { SECT_PARIS: "Bocq 004", MAS_EAU_SURF: "MM30R" }, geometry: box(4.88, 50.33, 4.93, 50.36) },
      { type: "Feature", properties: { SECT_PARIS: "Bocq 005", MAS_EAU_SURF: "MM30R" }, geometry: box(4.88, 50.30, 4.93, 50.33) },
      { type: "Feature", properties: { SECT_PARIS: "Far 001", MAS_EAU_SURF: "MM99R" }, geometry: box(4.70, 50.30, 4.8801, 50.36) }
    ]))
    # The outlet of Bocq 004 is on its southern edge, so it flows into Bocq 005.
    x, y = ActiveRecord::Base.connection.select_rows("SELECT ST_X(p), ST_Y(p) FROM ST_Transform(ST_SetSRID(ST_MakePoint(4.905, 50.33), 4326), 31370) p").first
    stub_request(:get, %r{#{EAU}/SECTEURS_PARIS_1621/MapServer/0/query}).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: {
      features: [
        { attributes: { SECT_PARIS: "Bocq 004", COURS_EAU: "Le Bocq", REPERE_AVA: "Entrée de Bauche (5530)", X_LB72_AVAL: x.to_f, Y_LB72_AVAL: y.to_f } },
        { attributes: { SECT_PARIS: "Bocq 005", COURS_EAU: "Le Bocq", REPERE_AVA: "Sortie de Bauche (5530)", X_LB72_AVAL: 0, Y_LB72_AVAL: 0 } }
      ]
    }.to_json)
    stub_request(:get, %r{#{EAU}/MESU/MapServer/2/query}).to_return(geojson([
      { type: "Feature", properties: { ID_RW_MESU: "MM30R", NOM_MESU: "Bocq II", AREA_KM2: 53.19, FICHE_PDF_MESU_FR: "https://example.org/MM30R.pdf" }, geometry: box(4.85, 50.28, 4.95, 50.37) }
    ]))
  end

  test "names the watercourses with their category and their manager, measured inside the commune" do
    data = TerritoryHydrography.new(@territory).call
    bocq, gence = data[:watercourses]
    assert_equal [ "Le Bocq", "category_1", 1000 ], bocq.values_at(:name, :category, :atlas_number)
    assert_equal "Région wallonne (SPW)", bocq[:manager]
    assert_in_delta 3550, bocq[:length_in_territory_m], 100, "two stretches, clipped to the commune"
    assert_includes %w[LineString MultiLineString], bocq.dig(:geometry, "type")
    assert_equal [ "Ruisseau de Gence", "category_3", "La commune" ], gence.values_at(:name, :category, :manager)
    assert_equal "SPW (test)", data[:attribution]
  end

  test "groups the runoff axes by class, from the region's default class" do
    axes = TerritoryHydrography.new(@territory).call[:runoff_axes]
    assert_requested @axes
    assert_equal 3, axes[:min_class]
    row = axes[:by_class].sole
    assert_equal [ 4, "50 à 100 ha", 1 ], row.values_at(:class, :upstream_area, :count)
    assert_in_delta 1110, row[:length_in_territory_m], 30
  end

  test "sub-basins: official outline, share inside, what flows into what, and a ready basin draft" do
    basins = TerritoryHydrography.new(@territory).call[:sub_basins]
    assert_equal [ "Bocq 004", "Bocq 005" ], basins.pluck(:id), "the far one barely touches the commune"
    upper, lower = basins
    assert_equal [ "Bocq 005", 1 ], upper.values_at(:flows_into, :suggested_order)
    assert_equal 2, lower[:suggested_order]
    assert_operator upper[:inside_km2], :>, 9
    assert_in_delta 0.6, upper[:share_of_territory], 0.02
    assert_equal "Le Bocq, Entrée de Bauche (5530)", upper.dig(:draft, :properties, :outlet)
    draft = upper[:draft]
    assert_equal [ "basin", "bocq-004", "Le Bocq — Entrée de Bauche (5530)" ], draft.values_at(:kind, :ref, :title)
    assert_nil draft[:geometry], "the server attaches the outline from paris_sector_ids"
    assert_equal [ "Bocq 004" ], draft.dig(:properties, :paris_sector_ids)
    assert_match(/secteur PARIS Bocq 004/, draft[:rationale])
  end

  test "water bodies with their sheet; outlines can be left out" do
    data = TerritoryHydrography.new(@territory).call(outlines: false)
    body = data[:water_bodies].sole
    assert_equal [ "MM30R", "Bocq II", "https://example.org/MM30R.pdf" ], body.values_at(:id, :name, :sheet_url)
    assert_nil body[:outline]
    assert_nil data[:sub_basins].first[:outline]
    assert_nil data[:watercourses].first[:geometry]
  end

  # Beauvechain, 13/11/2026: a sector « 0 » spread over half the province,
  # 9.8 km of stream without a name, and a slope no sector covers.
  test "issues: an invalid sector is set aside, streams without a name and uncovered fringes are said" do
    stub_request(:get, %r{#{EAU}/LIDAXES/MapServer/9/query}).to_return(geojson([
      { type: "Feature", properties: { CATEG: "03", NOMB: "", NOMA: "", NUMATLAS: 2170 }, geometry: line([ 4.92, 50.35 ], [ 4.92, 50.32 ]) }
    ]))
    stub_request(:get, %r{#{EAU}/SECTEURS_PARIS_1621/MapServer/1/query}).to_return(geojson([
      { type: "Feature", properties: { SECT_PARIS: "Bocq 004", MAS_EAU_SURF: "MM30R" }, geometry: box(4.88, 50.33, 4.93, 50.36) },
      { type: "Feature", properties: { SECT_PARIS: "Bocq 005", MAS_EAU_SURF: "MM30R" }, geometry: box(4.88, 50.32, 4.93, 50.33) },
      { type: "Feature", properties: { SECT_PARIS: "0", MAS_EAU_SURF: nil }, geometry: box(4.0, 50.0, 5.5, 50.315) }
    ]))
    data = TerritoryHydrography.new(@territory).call
    assert_equal [ "Bocq 004", "Bocq 005" ], data[:sub_basins].pluck(:id)
    kinds = data[:issues].group_by { |issue| issue[:kind] }
    assert_equal "0", kinds["invalid_sector"].sole[:id]
    unnamed = kinds["unnamed_watercourse"].sole
    assert_equal 2170, unnamed[:atlas_number]
    assert_match(/sans nom/, unnamed[:message])
    assert data[:watercourses].find { |w| w[:atlas_number] == 2170 }[:unnamed]
    fringe = kinds["uncovered"].sole
    assert_in_delta 3.9, fringe[:inside_km2], 0.3
    assert_equal [ "MM30R" ], fringe[:water_bodies].pluck(:id)
    assert_equal "Polygon", fringe.dig(:outline, "type")
  end

  test "sections, sector ids and a tolerance in metres keep the answer small" do
    data = TerritoryHydrography.new(@territory).call(sections: [ "sub_basins" ], sector_ids: [ "Bocq 005", "Nope 1" ], simplify_m: 50)
    assert_equal %i[attribution sub_basins missing_sector_ids], data.keys
    assert_equal [ "Bocq 005" ], data[:sub_basins].pluck(:id)
    assert_equal [ "Nope 1" ], data[:missing_sector_ids]
    assert_not_requested :get, %r{#{EAU}/LIDAXES/MapServer/1/query}
  end

  test "the outline of several sectors of one valley, merged, with its area; the sector at a point" do
    outline = TerritoryHydrography.new(@territory).outline_of([ "Bocq 004", "Bocq 005", "Nope 1" ])
    assert_equal [ "Bocq 004", "Bocq 005" ], outline[:sector_ids]
    assert_equal [ "Nope 1" ], outline[:missing]
    assert_equal "Polygon", outline.dig(:geometry, "type"), "two boxes side by side make one polygon"
    assert_in_delta 23.8, outline[:area_km2], 0.3

    assert_equal({ id: "Bocq 004", watercourse: "Le Bocq", water_body: "MM30R" }, TerritoryHydrography.new(@territory).sector_at(4.9, 50.35))
    assert_nil TerritoryHydrography.new(@territory).sector_at(5.2, 50.35)
  end

  test "unavailable without settings, and when the service is down" do
    assert_not TerritoryHydrography.new(@territory, provider: nil).available?
    stub_request(:get, %r{#{EAU}/LIDAXES/MapServer/6/query}).to_return(status: 503)
    assert_raises(TerritoryHydrography::Unavailable) { TerritoryHydrography.new(@territory).call }
  end
end
