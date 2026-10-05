require "test_helper"
require_relative "../../../test_helpers/claudy_import_test_helper"

class Imports::Claudy::ImporterTest < ActiveSupport::TestCase
  include ClaudyImportTestHelper

  setup do
    @map = maps(:ahinvaux)
    @drawn = map_features(:pond)
    stub_claudy_api
  end

  test "imports the plan from the API onto layers and element kinds" do
    report = claudy_import(@map)

    kinds = @map.features.where.not(id: @drawn.id).pluck(:layer, :kind).tally
    assert_equal({
      [ "existing", "zone" ] => 1, [ "existing", "path_existing" ] => 1, [ "existing", "point" ] => 1,
      [ "networks", "water_pipe" ] => 1, [ "networks", "point" ] => 2, [ "networks", "tap" ] => 1, [ "networks", "valve" ] => 1,
      [ "networks", "electric_line" ] => 1, [ "networks", "socket" ] => 1, [ "networks", "line" ] => 1,
      [ "notes", "note_point" ] => 3, [ "water", "swale" ] => 1, [ "water", "line" ] => 1, [ "water", "pond" ] => 1,
      [ "plants", "plant" ] => 5
    }, kinds)
    assert_equal 22, report.total(:created) - 2 # bio-indicator species are not map features
    assert_empty report.errors

    zone = imported(@map, "map_feature", 110)
    assert_equal({ "source" => "claudy", "type" => "map_feature", "id" => 110 }, zone.properties["import"])
    assert_equal "Verger du haut", zone.name
    assert_equal "active", zone.status
    assert_equal "human", zone.source
    assert_nil zone.created_by_id
    assert_match "Journal (Claudy) :", zone.notes
  end

  test "networks land in the sensitive layer, recognised from their nodes or set by hand" do
    report = claudy_import(@map)
    assert_equal "water", imported(@map, "map_feature", 120).properties["network"]
    assert_equal "electricity", imported(@map, "map_feature", 130).properties["network"]
    tap = imported(@map, "map_feature", 122)
    assert_equal false, tap.properties["potable"]
    assert_equal [ "Eau de pluie", false ], [ tap.water_source.name, tap.water_source.potable ]
    assert_equal [ "Eau de pluie" ], @map.water_sources.pluck(:name)
    ethernet = imported(@map, "map_feature", 140)
    assert_equal [ "networks", "line", nil ], [ ethernet.layer, ethernet.kind, ethernet.properties["network"] ]
    assert_equal({ "7" => 1 }, report.unknown_networks)
    assert_match "CLAUDY_NETWORK_LAYERS=7=water", report.to_s

    claudy_import(@map, network_layers: { "7" => "ethernet" })
    ethernet.reload
    assert_equal [ "ethernet_line", "ethernet" ], [ ethernet.kind, ethernet.properties["network"] ]
  end

  test "plants are linked to the catalogue, with palette items, and unmatched ones are listed" do
    report = claudy_import(@map)

    reinette = imported(@map, "plant", 7)
    assert_equal [ plant_species(:apple).id, plant_varieties(:reinette).id ], reinette.properties.values_at("species_id", "variety_id")
    assert_equal [ "2015-01-01", "year" ], reinette.properties.values_at("planted_on", "planted_on_precision")
    assert_equal "n° 12 — Pommier Reinette grise", reinette.name

    gravenstein = imported(@map, "plant", 8)
    assert_equal [ plant_species(:apple).id, nil, "Gravenstein", "2024-11-20" ],
                 gravenstein.properties.values_at("species_id", "variety_id", "unmatched_variety", "planted_on")

    alder = imported(@map, "plant", 9)
    assert_equal plant_species(:alder).id, alder.properties["species_id"]
    assert_nil alder.properties["planted_on"]

    assert_equal({ "name" => "Néflier", "latin_name" => "Mespilus germanica L." }, imported(@map, "plant", 10).properties["unmatched_species"])
    assert_equal({ "name" => "Mystère du talus" }, imported(@map, "plant", 13).properties["unmatched_species"])
    assert_equal({ "Néflier (Mespilus germanica L.)" => 1, "Mystère du talus" => 1 }, report.unmatched_species)
    assert_equal({ "Malus domestica « Gravenstein »" => 1 }, report.unmatched_varieties)
    assert_equal({ dead_plant: 1, unplaced_plant: 1 }, report.skipped.slice(:dead_plant, :unplaced_plant))

    palette = @map.palette_items.pluck(:species_id, :variety_id, :strata).sort_by(&:to_s)
    assert_equal [
      [ plant_species(:alder).id, nil, nil ], [ plant_species(:apple).id, nil, "canopy" ],
      [ plant_species(:apple).id, plant_varieties(:reinette).id, "canopy" ], [ plant_species(:comfrey).id, nil, nil ]
    ].sort_by(&:to_s), palette
    assert_equal 4, report.palette_created
  end

  test "bio-indicator species become observations of the map, linked to the soil catalogue" do
    claudy_import(@map)
    observations = @map.bioindicator_observations.order(:species_name)
    assert_equal [ [ "Ortie dioïque", "Urtica dioica", "dominant", "ortie" ], [ "Plantain majeur", "Plantago major", "frequent", "plantain_majeur" ] ],
                 observations.pluck(:species_name, :latin_name, :abundance, :catalog_key)
    assert_equal Date.new(2026, 4, 18), observations.first.observed_on
    assert_nil observations.first.observed_by_id
    assert_in_delta 4.9056, observations.first.location.x
  end

  test "photos are imported once, placed on points, and HEIC is refused" do
    report = claudy_import(@map)
    assert_equal({ created: 2, unsupported: 1 }, report.photos.symbolize_keys.slice(:created, :unsupported))

    zone_photo = @map.photos.where(map_feature: imported(@map, "map_feature", 110)).sole
    assert_equal [ "import", "verger.jpg", nil ], [ zone_photo.source, zone_photo.image.filename.to_s, zone_photo.location ]
    assert_equal "Verger du haut (photo importée de Claudy)", zone_photo.caption
    assert_equal Time.zone.parse("2026-05-20T10:00:00+02:00"), zone_photo.taken_at

    record_photo = @map.photos.where(map_feature: imported(@map, "map_feature", 180)).sole
    assert_in_delta 50.3399, record_photo.location.y
    assert_not_requested :get, %r{IMG_0001\.HEIC}

    report = claudy_import(@map)
    assert_equal 2, report.photos[:known]
    assert_equal 2, @map.photos.count
  end

  test "leaves the welcome map, comments, third-party records, tasks and personal data out" do
    report = claudy_import(@map)
    assert_equal({ welcome_map: 2, comments: 1, third_party_observation: 1, tasks: 1, dead_plant: 1, unplaced_plant: 1 }, report.skipped)
    everything = @map.features.reload.map { |f| [ f.name, f.notes, f.properties ] }.to_json + @map.bioindicator_observations.to_a.to_json
    [ "observer", "Jean Exemple", "Claude", "analyst", "notion", "Pépinière", "Gîte des Fauvettes", "Pic épeiche" ].each do |text|
      assert_no_match text, everything
    end
  end

  test "a second run updates nothing and creates nothing" do
    claudy_import(@map)
    assert_no_difference -> { @map.features.count } do
      assert_no_difference -> { ImportRecord.count } do
        report = claudy_import(@map)
        assert_equal 0, report.total(:created) + report.total(:updated)
        assert_equal 24, report.total(:unchanged)
      end
    end
  end

  test "a re-run links the plants whose species or variety entered the catalogue since" do
    claudy_import(@map)
    medlar = PlantSpecies.create!(latin_name: "Mespilus germanica")
    gravenstein = plant_species(:apple).varieties.create!(name: "Gravenstein")

    report = claudy_import(@map)

    neflier = imported(@map, "plant", 10)
    assert_equal medlar.id, neflier.properties["species_id"]
    assert_nil neflier.properties["unmatched_species"]
    assert_equal gravenstein.id, imported(@map, "plant", 8).properties["variety_id"]
    assert_equal({ "Mystère du talus" => 1 }, report.unmatched_species)
    assert_empty report.unmatched_varieties
    assert @map.palette_items.exists?(species_id: medlar.id)
  end

  test "a change in Claudy updates the feature, a change in Designer is kept" do
    claudy_import(@map)
    tas = imported(@map, "map_feature", 112)
    tas.update!(name: "Tas de bois (déplacé)", notes: "Vu avec Alice.")

    rows = all_claudy_feature_rows
    rows.find { |r| r["id"] == 111 }["name_i18n"] = { "fr" => "Sentier des chèvres" }
    rows.find { |r| r["id"] == 112 }["name_i18n"] = { "fr" => "Bûcher" }
    stub_claudy_api(features: rows)

    report = claudy_import(@map)
    assert_equal "Sentier des chèvres", imported(@map, "map_feature", 111).name
    assert_equal "Tas de bois (déplacé)", tas.reload.name
    assert_equal 1, report.kept[:edited]
    assert_match "FORCE=1 pour le remplacer", report.to_s

    claudy_import(@map, force: true)
    assert_equal [ "Bûcher", nil ], [ tas.reload.name, tas.notes ]
  end

  test "a feature deleted in Designer is not brought back unless forced" do
    claudy_import(@map)
    imported(@map, "map_feature", 112).destroy!

    report = claudy_import(@map)
    assert_equal 1, report.kept[:deleted]
    assert_empty @map.features.where("properties -> 'import' ->> 'id' = '112'")

    claudy_import(@map, force: true)
    assert imported(@map, "map_feature", 112)
  end

  test "never touches what was drawn in Designer" do
    before = @drawn.attributes.except("updated_at")
    claudy_import(@map)
    claudy_import(@map, force: true)
    assert_equal before, @drawn.reload.attributes.except("updated_at")
  end

  test "a dry run writes nothing and downloads no photo" do
    report = nil
    assert_no_difference [ -> { MapFeature.count }, -> { ImportRecord.count }, -> { PaletteItem.count }, -> { MapPhoto.count } ] do
      report = claudy_import(@map, dry_run: true)
    end
    assert_equal 22, report.total(:created) - 2
    assert_equal 2, report.photos[:planned]
    assert_not_requested :get, %r{storage\.claudy\.test}
    assert_match "Simulation (DRY_RUN=1)", report.to_s
  end

  test "PHOTOS=0 leaves the photos in Claudy" do
    report = claudy_import(@map, photos: false)
    assert_equal 0, @map.photos.count
    assert_match "Photos : non importées (PHOTOS=0).", report.to_s
  end

  test "an element the library refuses falls back to the generic kind of its layer" do
    rows = all_claudy_feature_rows
    rows.find { |r| r["id"] == 172 }["properties"]["design"]["depth"] = 40
    stub_claudy_api(features: rows)

    report = claudy_import(@map)
    pond = imported(@map, "map_feature", 172)
    assert_equal [ "water", "zone", 40 ], [ pond.layer, pond.kind, pond.properties["depth_m"] ]
    assert_match "« Mare 2 » (Claudy map_feature n° 172) ne convient pas à « #{MapElements.label('pond')} »", report.warnings.sole
  end

  test "a photo that fails to download is reported and the import goes on" do
    stub_request(:get, "https://storage.claudy.test/releve.png").to_return(status: 500)
    report = claudy_import(@map)
    assert_equal 1, report.photos[:failed]
    assert_match "storage.claudy.test", report.to_s
    assert imported(@map, "map_feature", 180)
  end

  test "a Claudy that stops answering aborts with the report so far" do
    stub_request(:get, "#{CLAUDY_API}/plants?page=1&per_page=200").to_return(status: 401)
    importer = Imports::Claudy::Importer.new(map: @map, source: claudy_api_source)
    assert_raises(Imports::Claudy::Error) { importer.call }
    assert_match "Claudy refuse la clé", importer.report.aborted
    assert imported(@map, "map_feature", 110)
  end

  test "prints a French summary" do
    text = claudy_import(@map).to_s
    assert_match "Import de Claudy dans « Domaine d'Ahinvaux »", text
    assert_match "Source : API https://claudy.test/api/v1", text
    assert_match "#{MapElements.label('plant')} · #{I18n.t('editor.layers.plants')} : 5 créés", text
    assert_match "Photos : 2 ajoutées, 1 refusée (format non accepté, HEIC par exemple).", text
    assert_match "Palette : 4 espèces ou variétés ajoutées.", text
    assert_match "  - Néflier (Mespilus germanica L.) : 1 plante", text
    assert_match "2 éléments de la carte d'accueil", text
    assert_match "1 tâche du carnet", text
    assert_match "Les notes manuscrites : l'API de Claudy ne les expose pas", text
  end
end
