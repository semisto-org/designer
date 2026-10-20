require "test_helper"

class ElementFunctionsTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux) # holds the fixture pond
  end

  def add(kind, layer:, geometry: square(size: 0.0001), **attrs)
    @map.features.create!(layer:, kind:, geometry:, **attrs)
  end

  def plant(species, **properties)
    add("plant", layer: "plants", geometry: point(lng: 4.906, lat: 50.341), properties: { "species_id" => species.id, **properties })
  end

  def status(review, function) = review.balance.find { |b| b[:function] == function }[:status]

  test "every function, need and yield of the library is in the vocabulary, with a French label" do
    MapElements.elements.each_value do |element|
      assert_empty Array(element.functions) - ElementFunctions::FUNCTIONS, element.kind
      assert_empty (element.needs + element.yields) - ElementFunctions::RESOURCES, element.kind
    end
    ElementFunctions::FUNCTIONS.each do |f|
      assert I18n.exists?("element_functions.names.#{f}", :fr), f
      assert I18n.exists?("element_functions.look.#{f}", :fr), f
    end
    ElementFunctions::RESOURCES.each { |r| assert I18n.exists?("element_functions.resources.#{r}", :fr), r }
  end

  test "a function served by one element is fragile, by none missing, by two covered" do
    review = ElementFunctions.new(@map)
    assert_equal "fragile", status(review, "water")
    assert_equal "missing", status(review, "food")

    add("swale", layer: "water", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.3415 ], [ 4.906, 50.3416 ] ] })
    assert_equal "covered", status(ElementFunctions.new(@map), "water")
  end

  test "plants of one species count once, with the functions the catalogue gives them" do
    3.times { plant(plant_species(:apple)) }
    entry = ElementFunctions.new(@map).entries.find { |e| e.kind == "plant" }
    assert_equal "species:#{plant_species(:apple).id}", entry.key
    assert_equal 3, entry.feature_ids.size
    assert_match(/×3\z/, entry.label)
    assert_equal %w[food pollination wood], entry.functions
    assert_equal "species", entry.origin
    assert_equal "fragile", status(ElementFunctions.new(@map), "food")
  end

  test "the functions a person sets replace the proposed ones, and must be known" do
    pond = map_features(:pond)
    pond.update!(properties: { "functions" => %w[habitat water] })
    entry = ElementFunctions.new(@map).entries.sole
    assert_equal [ %w[water habitat], "own" ], [ entry.functions, entry.origin ]

    pond.update!(properties: { "functions" => [] })
    assert_equal "missing", status(ElementFunctions.new(@map), "water")

    pond.properties = { "functions" => %w[water teleportation] }
    refute pond.valid?
  end

  test "a need nothing on the place gives is unmet, until something yields it" do
    add("compost", layer: "structures", geometry: point(lng: 4.9051, lat: 50.3401))
    needs = ElementFunctions.new(@map).unmet_needs
    assert_equal [ "organic_matter" ], needs.map { |n| n[:resource] } # the pond gives the water

    add("hedge", layer: "structures", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.3415 ], [ 4.906, 50.3416 ] ] })
    assert_empty ElementFunctions.new(@map).unmet_needs
  end

  test "notes, paths, drafts and existing-only functions" do
    add("note_point", layer: "notes", geometry: point(lng: 4.9051, lat: 50.3401))
    add("path", layer: "access", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.3415 ], [ 4.906, 50.3416 ] ] })
    add("hedge", layer: "structures", status: "draft", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.3415 ], [ 4.906, 50.3416 ] ] })
    add("existing_hedge", layer: "existing", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.3417 ], [ 4.906, 50.3418 ] ] })
    add("existing_tree", layer: "existing", geometry: point(lng: 4.9052, lat: 50.3404))
    review = ElementFunctions.new(@map)
    assert_equal %w[pond existing_hedge existing_tree].sort, review.entries.map(&:kind).sort
    wood = review.balance.find { |b| b[:function] == "wood" }
    assert_equal [ "covered", true ], wood.values_at(:status, :existingOnly)
  end
end
