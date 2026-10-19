require "test_helper"

class WeekReportTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @today = Date.new(2026, 4, 14)
    @forecast = Struct.new(:json) { def as_json(*) = json }.new({ "available" => false, "reason" => "not_configured", "supported" => false })
    point = RGeo::Geographic.spherical_factory(srid: 4326).point(4.906, 50.341)
    @map.features.create!(layer: "plants", kind: "plant", name: "Pommier", geometry: point, properties: { "species_id" => plant_species(:apple).id })
  end

  def report = WeekReport.new(@map, today: @today, forecast: @forecast).as_json

  test "the month's season card and the forecast as the climate report gives it" do
    json = report
    assert_equal "2026-04-14", json["today"]
    assert_equal 4, json["season"]["month"]
    assert_match "Avril", json["season"]["title"]
    assert_equal "not_configured", json["forecast"]["reason"]
  end

  test "what the plants placed on the map do this month" do
    plants = report["plants"]
    assert_equal 1, plants["flowering"]["count"]
    assert_equal 0, plants["harvest"]["count"]
    assert_equal [], plants["pruning"]["names"]

    september = WeekReport.new(@map, today: Date.new(2026, 9, 1), forecast: @forecast).as_json["plants"]
    assert_equal 1, september["harvest"]["count"]
    assert_equal 0, september["flowering"]["count"]
  end

  test "the tasks due within a week or late, soonest first, not the done ones nor the later ones" do
    list = @map.task_lists.create!(name: "Printemps")
    late = list.tasks.create!(title: "Pailler le verger", due_on: @today - 3)
    soon = list.tasks.create!(title: "Semer les engrais verts", due_on: @today + 5)
    list.tasks.create!(title: "Récolter", due_on: @today + 30)
    list.tasks.create!(title: "Déjà fait", due_on: @today, completed_at: Time.current)
    tasks = report["tasks"]
    assert_equal [ late.id, soon.id ], tasks.map { _1["id"] }
    assert_equal [ true, false ], tasks.map { _1["overdue"] }
  end
end
