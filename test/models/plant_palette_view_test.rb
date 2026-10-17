require "test_helper"

class PlantPaletteViewTest < ActiveSupport::TestCase
  test "settings keep only what the table understands" do
    view = PlantPaletteView.create!(map: maps(:ahinvaux), name: "  Chantier   mars ", settings: {
      columns: %w[planned bogus name supplier], group_by: "everything", sort: { key: "drop table", dir: "up" },
      filters: { statuses: %w[planned nope], strata: %w[canopy], roles: %w[food x], tag: "Chantier mars", to_plant_only: "1", extra: 1 }
    })
    assert_equal "Chantier mars", view.name
    assert_equal %w[name planned supplier], view.settings["columns"]
    assert_equal "none", view.settings["group_by"]
    assert_equal({ "key" => "name", "dir" => "asc" }, view.settings["sort"])
    filters = view.settings["filters"]
    assert_equal %w[planned], filters["statuses"]
    assert_equal %w[food], filters["roles"]
    assert_equal "Chantier mars", filters["tag"]
    assert filters["to_plant_only"]
    assert_not filters.key?("extra")
  end

  test "the built-in views are valid views" do
    presets = PlantPaletteView.presets_json
    assert_equal %w[base budget shopping follow_up], presets.map { _1[:key] }
    assert_equal "Liste de courses chantier", presets[2][:name]
    presets.each { |preset| assert_equal PlantPaletteView.clean_settings(preset[:settings]), preset[:settings] }
    assert_equal "supplier", presets[2][:settings]["group_by"]
  end

  test "a map keeps a bounded number of views" do
    map = maps(:ahinvaux)
    PlantPaletteView::MAX_VIEWS.times { |i| PlantPaletteView.create!(map:, name: "Vue #{i}") }
    assert_not PlantPaletteView.new(map:, name: "Une de trop").valid?
  end
end
