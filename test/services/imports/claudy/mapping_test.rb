require "test_helper"
require_relative "../../../test_helpers/claudy_import_test_helper"

class Imports::Claudy::MappingTest < ActiveSupport::TestCase
  include ClaudyImportTestHelper
  Mapping = Imports::Claudy::Mapping

  def row(id) = all_claudy_feature_rows.find { |r| r["id"] == id }
  def plant_row(id) = claudy_rows("api/plants_page1.json").find { |r| r["id"] == id }

  test "leaves the welcome map, comments and third-party observations in Claudy" do
    assert_equal :welcome_map, Mapping.feature(row(101)).reason
    assert_equal :welcome_map, Mapping.feature(row(102)).reason
    assert_equal :comments, Mapping.feature(row(150)).reason
    assert_equal :third_party_observation, Mapping.feature(row(161)).reason
    assert_equal :plant_point, Mapping.feature(row(190)).reason
    assert_equal :no_geometry, Mapping.feature(row(110).merge("geometry" => { "type" => "Polygon", "coordinates" => [ [ [ 1, 2 ] ] ] })).reason
    assert_equal :unknown_layer, Mapping.feature(row(110).merge("layer_kind" => "gauges")).reason
  end

  test "a management zone keeps its description, management notes and dated notes, newest first" do
    detail = claudy_json("api/details.json").dig("map_features", "110")
    target = Mapping.feature(row(110), detail:)
    assert_equal [ "existing", "zone", "Verger du haut" ], [ target.layer, target.kind, target.name ]
    assert_equal <<~NOTES.strip, target.notes
      Vieux pommiers haute tige sur prairie.

      Gestion : Fauche tardive après le 15 juillet.

      Journal (Claudy) :
      14/02/2026 — Taille de formation des jeunes pommiers.
      03/10/2025 — Clôture réparée côté route.
    NOTES
    assert_equal "path_existing", Mapping.feature(row(111)).kind
    assert_equal "point", Mapping.feature(row(112)).kind
  end

  test "network elements go to the networks layer, without inventing library defaults" do
    pipe = Mapping.feature(row(120), network: "water")
    assert_equal [ "networks", "water_pipe" ], [ pipe.layer, pipe.kind ]
    assert_equal({ "network" => "water", "potable" => nil, "material" => nil, "diameter_mm" => nil }, pipe.properties.slice("network", "potable", "material", "diameter_mm"))
    assert_not pipe.properties.key?("gauge")

    tap = Mapping.feature(row(122), network: "water")
    assert_equal [ "tap", "Robinet du potager", false, "rain" ], [ tap.kind, tap.name, tap.properties["potable"], tap.properties["water_source"] ]
    assert_match "Consignes : Purger avant les gelées.", tap.notes
    assert_match "Origine de l'eau : Eau de pluie. Eau non potable.", tap.notes

    cistern = Mapping.feature(row(121), network: "water")
    assert_equal [ "point", "Citerne", "cistern" ], [ cistern.kind, cistern.name, cistern.properties["node_type"] ]
    assert_equal "valve", Mapping.feature(row(123), network: "water").kind
    assert_equal "electric_line", Mapping.feature(row(130), network: "electricity").kind
    assert_equal "socket", Mapping.feature(row(131), network: "electricity").kind
    assert_equal "Tableau de l'atelier", Mapping.feature(row(132), network: "electricity").name
    assert_equal "line", Mapping.feature(row(140), network: nil).kind
  end

  test "trial designs of the 3D view become water and structure elements" do
    swale = Mapping.feature(row(170))
    assert_equal [ "water", "swale" ], [ swale.layer, swale.kind ]
    assert_equal({ "width_m" => 2, "depth_m" => 0.5, "berm_m" => 0.4, "grade_pct" => 0 }, swale.properties)

    keyline = Mapping.feature(row(171))
    assert_equal [ "water", "line", "keyline" ], [ keyline.layer, keyline.kind, keyline.properties["design_type"] ]
    assert_match "Désactivé dans la vue 3D de Claudy.", keyline.notes

    pond = Mapping.feature(row(172))
    assert_equal [ "water", "pond", 1.2, nil ], [ pond.layer, pond.kind, pond.properties["depth_m"], pond.properties["purpose"] ]
    assert pond.properties.key?("purpose")

    hedge = Mapping.feature(row(170).merge("properties" => { "design" => { "type" => "hedge", "width" => 3 } }))
    assert_equal [ "structures", "hedge", 3 ], [ hedge.layer, hedge.kind, hedge.properties["width_m"] ]
  end

  test "own observations become note points without their observer" do
    note = Mapping.feature(row(160))
    assert_equal [ "notes", "note_point", "Hérisson d'Europe" ], [ note.layer, note.kind, note.name ]
    assert_equal({ "realm" => "fauna", "species_common" => "Hérisson d'Europe", "species_latin" => "Erinaceus europaeus",
                   "observed_on" => "2026-05-03", "count" => 2 }, note.properties.except(*MapElements.defaults_for("note_point").keys))
    assert_match "Faune, observée le 03/05/2026.", note.notes
    assert_no_match "observer", note.properties.to_json
  end

  test "a bio-indicator record keeps its diagnosis and its species, never the analyst or the observer" do
    note = Mapping.feature(row(180))
    assert_equal "Relevé de plantes bio-indicatrices du 18/04/2026", note.name
    assert_equal({ "observed_on" => "2026-04-18", "agronomy" => "degrading" }, note.properties.compact)
    assert_match "Diagnostic : Sol tassé", note.notes
    assert_match "Pistes : Aérer", note.notes
    assert_no_match "Claude", note.to_h.to_json
    assert_no_match "observer", note.to_h.to_json

    species = Mapping.bioindicator_species(row(180))
    assert_equal [ "plantago major", "urtica dioica" ], species.map { |s| s[:key] }
    assert_equal [ "frequent", "dominant" ], species.map { |s| s[:abundance] }
    assert_equal "En bordure du chemin.\n\nIdentification sûre.", species.first[:notes]
    assert_equal "2026-04-18", species.first[:observed_on]

    assert_match "À analyser", Mapping.feature(row(181)).notes
    assert_empty Mapping.bioindicator_species(row(181))
  end

  test "plants keep their number, species, cultivar and known planting date" do
    match = Imports::Claudy::SpeciesMatcher::Match.new(species: plant_species(:apple), variety: plant_varieties(:reinette), cultivar: "Reinette grise")
    target = Mapping.plant(plant_row(7), match:)
    assert_equal [ "plants", "plant", "n° 12 — Pommier Reinette grise" ], [ target.layer, target.kind, target.name ]
    assert_equal({ "species_id" => plant_species(:apple).id, "variety_id" => plant_varieties(:reinette).id, "planted_on" => "2015-01-01",
                   "planted_on_precision" => "year", "number" => "12" }, target.properties)
    assert_equal({ "type" => "Point", "coordinates" => [ 4.9062, 50.3407 ] }, target.geometry)
    assert_match "Greffé sur franc.", target.notes
    assert_match "Statut dans Claudy : Existante.", target.notes
    assert_match "Plantée en 2015.", target.notes
    assert_no_match "Pépinière", target.to_h.to_json
    assert_no_match "notion", target.to_h.to_json

    unmatched = Mapping.plant(plant_row(10), match: nil)
    assert_equal({ "name" => "Néflier", "latin_name" => "Mespilus germanica L." }, unmatched.properties["unmatched_species"])
    assert_nil unmatched.properties["species_id"]

    assert_equal :dead_plant, Mapping.plant(plant_row(12), match: nil).reason
    assert_equal :unplaced_plant, Mapping.plant(plant_row(11), match: nil).reason
  end

  test "planned plants are never marked planted, and future dates are ignored" do
    assert_equal({}, Mapping.planting(plant_row(9)))
    assert_equal({ "planted_on" => "2024-11-20" }, Mapping.planting(plant_row(8)))
    assert_equal({}, Mapping.planting("status" => "planted", "planted_on" => (Date.current + 30).iso8601))
    assert_equal({}, Mapping.planting("status" => "existing", "planted_year" => 1700))
  end

  test "maps Claudy strata onto palette strata" do
    assert_equal "canopy", Mapping.strata("tree")
    assert_equal "sub_canopy", Mapping.strata("coppice")
    assert_equal "ground_cover", Mapping.strata("groundcover")
    assert_nil Mapping.strata(nil)
  end

  test "a sketch turns Leaflet strokes into one GeoJSON MultiLineString and drops dots" do
    target = Mapping.sketch("id" => 3, "name" => "Idée de mare", "folder" => "Eau",
                            "strokes" => [ { "points" => [ [ 50.34, 4.90 ], [ 50.341, 4.901 ], [ 50.341, 4.901 ] ] }, { "points" => [ [ 50.34, 4.9 ] ] } ])
    assert_equal [ "notes", "sketch", "Idée de mare" ], [ target.layer, target.kind, target.name ]
    assert_equal({ "type" => "MultiLineString", "coordinates" => [ [ [ 4.90, 50.34 ], [ 4.901, 50.341 ] ] ] }, target.geometry)
    assert_equal({ "folder" => "Eau" }, target.properties)
    assert_equal :empty_sketch, Mapping.sketch("strokes" => [ { "points" => [ [ 50.34, 4.9 ] ] } ]).reason
  end

  test "keeps geometries in 2D and refuses broken ones" do
    assert_equal({ "type" => "Point", "coordinates" => [ 4.9, 50.3 ] }, Mapping.geometry({ "type" => "Point", "coordinates" => [ 4.9, 50.3, 210 ] }))
    assert_nil Mapping.geometry({ "type" => "Point", "coordinates" => [ 400, 50 ] })
    assert_nil Mapping.geometry({ "type" => "GeometryCollection", "geometries" => [] })
    assert_equal "zone", Mapping.generic_kind({ "type" => "MultiPolygon" })
    assert_equal "line", Mapping.generic_kind({ "type" => "MultiLineString" })
  end
end
