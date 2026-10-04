require "test_helper"

# Palette, patches, quantities, plant list and coherence alerts of a map.
class PlantingTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    regions(:wallonia).update!(settings: { "climate" => { "hardiness_zone" => 7 } })
    # ≈ 316 m² (0.0002° square at 50.34° N)
    @patch = @map.features.create!(layer: "plants", kind: "patch", name: "Lisière", geometry: square(lng: 4.904, lat: 50.3395, size: 0.0002))
  end

  test "the site's hardiness comes from the climate at the map, else from the region" do
    assert_equal 7, @map.hardiness_zone
    data = { zone: { number: 6 }, normals: { extreme_min_c: -21.0 } }
    climate = Object.new
    climate.define_singleton_method(:current_normals) { |_point| Providers::Climate::Result.ok(data, provider: "static") }
    original = Providers::Climate.method(:for)
    Providers::Climate.define_singleton_method(:for) { |*| climate }
    map = Map.find(@map.id)
    assert_equal 6, map.hardiness_zone
    assert_equal(-21.0, map.min_temperature_c)
  ensure
    Providers::Climate.define_singleton_method(:for, original) if original
  end

  def plant!(species, variety: nil, lng: 4.906, lat: 50.341, planted_on: nil)
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng:, lat:),
                          properties: { "species_id" => species.id, "variety_id" => variety&.id, "planted_on" => planted_on }.compact)
  end

  test "plant features validate species, variety and planted date" do
    plant = plant!(plant_species(:apple), variety: plant_varieties(:reinette), planted_on: "2026-03-01")
    assert_equal plant_species(:apple).id, plant.plant_species_id
    assert_equal Date.new(2026, 3, 1), plant.planted_on

    wrong_variety = @map.features.new(layer: "plants", kind: "plant", geometry: point,
                                      properties: { "species_id" => plant_species(:alder).id, "variety_id" => plant_varieties(:reinette).id })
    assert_not wrong_variety.valid?
    future = @map.features.new(layer: "plants", kind: "plant", geometry: point,
                               properties: { "species_id" => plant_species(:alder).id, "planted_on" => (Date.current + 2).iso8601 })
    assert_not future.valid?
    polygon_plant = @map.features.new(layer: "plants", kind: "plant", geometry: square)
    assert_not polygon_plant.valid?
    bad_exposure = @map.features.new(layer: "plants", kind: "patch", geometry: square, properties: { "exposure" => "moon" })
    assert_not bad_exposure.valid?
  end

  test "patch quantities: density × PostGIS area, count, strata default" do
    @patch.patch_items.create!(species: plant_species(:comfrey), density: 1)
    @patch.patch_items.create!(species: plant_species(:strawberry))
    @patch.patch_items.create!(species: plant_species(:apple), count: 2)

    quantities = @map.planted_quantities
    area = quantities.patch(@patch.id).area_m2
    assert_in_delta 316, area, 20
    assert_equal area.round, quantities.planned_for([ plant_species(:comfrey).id, nil ])
    assert_equal (6.0 * area).round, quantities.planned_for([ plant_species(:strawberry).id, nil ]), "ground cover default 6/m²"
    assert_equal 2, quantities.planned_for([ plant_species(:apple).id, nil ])
  end

  test "a plant placed inside a patch that composes it is a placement, not an extra plant" do
    @patch.patch_items.create!(species: plant_species(:apple), count: 3)
    plant!(plant_species(:apple), lng: 4.9041, lat: 50.3396)   # inside the patch
    plant!(plant_species(:apple), lng: 4.906, lat: 50.341, planted_on: "2026-02-01")  # isolated
    plant!(plant_species(:alder))
    @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: {})  # no species

    quantities = @map.planted_quantities
    slot = quantities.slot_for([ plant_species(:apple).id, nil ])
    assert_equal 3, slot.composed
    assert_equal 1, slot.isolated
    assert_equal 2, slot.placed
    assert_equal 1, slot.planted
    assert_equal 4, slot.planned
    assert_equal 5, quantities.total
    assert_equal 1, quantities.unlinked_count
  end

  test "palette strata override drives the plant list" do
    @map.palette_items.create!(species: plant_species(:apple), strata: "canopy")
    plant!(plant_species(:apple))
    plant!(plant_species(:apple), variety: plant_varieties(:reinette))
    plant!(plant_species(:comfrey))

    list = @map.plant_list
    assert_equal 3, list.total
    assert_equal %w[canopy canopy herbaceous], list.rows.map(&:strata)
    assert_equal [ "Malus domestica", "Malus domestica 'Reinette grise'", "Symphytum officinale" ], list.rows.map(&:latin_name)
    assert_equal 2, list.species_count

    csv = list.to_csv
    assert csv.start_with?("﻿")
    lines = csv.delete_prefix("﻿").lines
    assert_equal "Strate;Nom latin;Variété;Nom commun;Plants isolés;Dans les patches;Total;Hauteur adulte (m);Envergure adulte (m)", lines.first.chomp
    assert_includes lines[2], "Malus domestica 'Reinette grise';Reinette grise;Pommier;1;0;1;4,50;4,00"
  end

  test "rejected and draft features are not counted" do
    plant!(plant_species(:apple)).update!(status: "draft")
    assert_equal 0, @map.planted_quantities.total
  end

  test "alerts: density, exposure, hardiness, invasive, nitrogen, pollination" do
    @patch.update!(properties: { "exposure" => "shade" })
    @patch.patch_items.create!(species: plant_species(:strawberry), density: 20)
    @patch.patch_items.create!(species: plant_species(:rosemary), count: 1)
    5.times { |i| plant!(plant_species(:apple), lng: 4.906 + i * 0.0001) }
    @map.palette_items.create!(species: plant_species(:robinia))

    alerts = @map.planting_alerts
    rules = alerts.alerts.map(&:rule)
    assert_includes rules, "density"
    assert_includes rules, "exposure"
    assert_includes rules, "hardiness"
    assert_includes rules, "invasive"
    assert_includes rules, "nitrogen"
    assert_not_includes rules, "pollination", "five seedlings of a self-sterile species pollinate each other"

    density = alerts.alerts.find { |a| a.rule == "density" }
    assert_equal @patch.id, density.feature_id
    assert_match "20 plants/m²", density.message
    hardiness = alerts.alerts.find { |a| a.rule == "hardiness" }
    assert_match "zone 8", hardiness.message
    assert_match "zone 7", hardiness.message
    nitrogen = alerts.alerts.find { |a| a.rule == "nitrogen" }
    assert_equal "warning", nitrogen.level
    assert_equal alerts.alerts.select { |a| a.feature_id == @patch.id }, alerts.for_feature(@patch.id)
    assert_equal 7, alerts.as_json[:zone]
  end

  test "pollination: a single self-sterile cultivar is flagged, two cultivars are partners" do
    plant!(plant_species(:apple), variety: plant_varieties(:reinette))
    plant!(plant_species(:apple), variety: plant_varieties(:reinette), lng: 4.9062)
    assert_includes @map.planting_alerts.alerts.map(&:rule), "pollination"
    plant!(plant_species(:apple), variety: plant_varieties(:boskoop), lng: 4.9064)
    assert_not_includes @map.planting_alerts.alerts.map(&:rule), "pollination"
  end

  test "nitrogen: enough fixers, no alert; strata alert lists missing strata" do
    4.times { |i| plant!(plant_species(:apple), lng: 4.906 + i * 0.0001) }
    plant!(plant_species(:alder), lng: 4.907)
    10.times { |i| plant!(plant_species(:comfrey), lng: 4.908 + i * 0.0001) }
    alerts = @map.planting_alerts.alerts
    assert_not_includes alerts.map(&:rule), "nitrogen"
    strata = alerts.find { |a| a.rule == "strata" }
    assert_match "arbustive", strata.message
    assert_match "couvre-sol", strata.message
  end

  test "palette suggestions fill what is missing, hardy and not invasive" do
    @map.palette_items.create!(species: plant_species(:apple))
    suggestions = PaletteSuggestions.new(@map).suggestions
    reasons = suggestions.to_h { |s| [ s.species.latin_name, s.reason ] }
    assert_equal "nitrogen", reasons["Alnus glutinosa"]
    assert_not reasons.key?("Robinia pseudoacacia")
    assert_not reasons.key?("Salvia rosmarinus")
    assert_not reasons.key?("Malus domestica"), "already in the palette"
  end

  test "palette items: one per species or cultivar, variety of its species" do
    @map.palette_items.create!(species: plant_species(:apple))
    assert_not @map.palette_items.new(species: plant_species(:apple)).valid?
    assert @map.palette_items.new(species: plant_species(:apple), variety: plant_varieties(:reinette)).valid?
    assert_not @map.palette_items.new(species: plant_species(:alder), variety: plant_varieties(:reinette)).valid?
    assert_not @map.palette_items.new(species: plant_species(:alder), role: "boss").valid?
  end

  test "observations: stats per species from the latest observation of each plant" do
    plant = plant!(plant_species(:apple), planted_on: "2026-03-01")
    other = plant!(plant_species(:apple), planted_on: "2026-03-01", lng: 4.9062)
    plant.plant_observations.create!(observed_on: "2026-04-01", survival: "struggling", vigor: 2)
    plant.plant_observations.create!(observed_on: "2026-06-01", survival: "established", vigor: 4)
    other.plant_observations.create!(observed_on: "2026-06-01", survival: "dead")

    stats = PlantObservation.stats_for(plant_species(:apple))
    assert_equal 2, stats[:plants]
    assert_equal 1, stats[:gardens]
    assert_equal 1, stats[:established]
    assert_equal 1, stats[:dead]
    assert_equal 50, stats[:survivalRate]
    assert_equal 4.0, stats[:averageVigor]
    assert_nil PlantObservation.stats_for(plant_species(:alder))

    assert_not plant.plant_observations.new(observed_on: Date.current + 2, survival: "dead").valid?
    assert plant.plant_observations.new(observed_on: Date.current + 1, survival: "dead").valid?, "a day ahead for time zones"
    assert_not @patch.plant_observations.new(observed_on: Date.current, survival: "dead").valid?
  end

  test "map hardiness comes from its region" do
    assert_equal 7, @map.hardiness_zone
    assert_equal(-17.6, @map.min_temperature_c)
    assert_equal "BE", @map.country_code
  end
end
