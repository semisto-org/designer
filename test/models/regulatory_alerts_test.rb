require "test_helper"

class RegulatoryAlertsTest < ActiveSupport::TestCase
  RULES = [
    { "key" => "pond_max_area", "check" => "max_area", "kinds" => %w[pond], "max_m2" => 100, "severity" => "warning",
      "source" => { "label" => "CoDT", "url" => "https://example.org/codt.pdf" } },
    { "key" => "pond_boundary_distance", "check" => "min_boundary_distance", "kinds" => %w[pond], "min_m" => 3, "severity" => "warning" },
    { "key" => "pond_single", "check" => "max_count", "kinds" => %w[pond], "max" => 1, "severity" => "info" },
    { "key" => "flood_zone", "check" => "flood_zone", "kinds" => %w[shed] }
  ].freeze

  setup do
    @map = maps(:ahinvaux)
    @map.features.delete_all
  end

  # An axis-aligned rectangle of width x height meters whose south-west
  # corner is at (lng, lat).
  def rectangle(lng, lat, width, height)
    dlat = height / 111_320.0
    dlng = width / (111_320.0 * Math.cos(lat * Math::PI / 180))
    { "type" => "Polygon", "coordinates" => [ [ [ lng, lat ], [ lng + dlng, lat ], [ lng + dlng, lat + dlat ], [ lng, lat + dlat ], [ lng, lat ] ] ] }
  end

  # Inside the fixture boundary (4.903..4.912, 50.339..50.343), far from it.
  def middle = [ 4.907, 50.341 ]

  def pond(geometry, **attrs)
    @map.features.create!({ layer: "water", kind: "pond", geometry: }.merge(attrs))
  end

  test "a pond over 100 m² may need a permit" do
    big = pond(rectangle(*middle, 12, 10))
    pond(rectangle(4.909, 50.3405, 8, 8))
    alerts = RegulatoryAlerts.new(@map, rules: RULES.first(1)).alerts

    assert_equal 1, alerts.size
    alert = alerts.first
    assert_equal [ big.id ], alert.feature_ids
    assert_equal "warning", alert.severity
    assert_equal "Mare de 120 m²", alert.title
    assert_includes alert.explanation, "100 m²"
    assert_equal({ "label" => "CoDT", "url" => "https://example.org/codt.pdf" }, alert.source)
  end

  test "a pond closer than 3 m to the terrain limits" do
    near = pond(rectangle(4.903 + 0.00002, 50.341, 5, 5)) # about 1.4 m from the west limit
    pond(rectangle(*middle, 5, 5))
    alerts = RegulatoryAlerts.new(@map, rules: [ RULES[1] ]).alerts

    assert_equal [ [ near.id ] ], alerts.map(&:feature_ids)
    assert_match(/\AMare à 1,4 m de la limite\z/, alerts.first.title)
  end

  test "a pond crossing the limit is at 0 m" do
    crossing = pond(rectangle(4.903 - 0.00005, 50.341, 8, 5))
    alert = RegulatoryAlerts.new(@map, rules: [ RULES[1] ]).alerts.sole
    assert_equal [ crossing.id ], alert.feature_ids
    assert_includes alert.title, "0 m"
  end

  test "no distance check without a boundary" do
    @map.update_columns(boundary: nil)
    pond(rectangle(4.903 + 0.00002, 50.341, 5, 5))
    assert_empty RegulatoryAlerts.new(@map.reload, rules: [ RULES[1] ]).alerts
  end

  test "only one pond is exempt" do
    first = pond(rectangle(*middle, 5, 5))
    second = pond(rectangle(4.909, 50.3405, 5, 5))
    alert = RegulatoryAlerts.new(@map, rules: [ RULES[2] ]).alerts.sole
    assert_equal [ first.id, second.id ], alert.feature_ids
    assert_equal "info", alert.severity
    assert_equal "2 mares sur le terrain", alert.title
  end

  test "rejected proposals are ignored, drafts are checked, unknown checks are skipped" do
    pond(rectangle(*middle, 12, 10), status: "rejected", source: "ai")
    assert_empty RegulatoryAlerts.new(@map, rules: RULES).alerts
    pond(rectangle(*middle, 12, 10), status: "draft", source: "ai")
    assert_equal %w[pond_max_area], RegulatoryAlerts.new(@map, rules: RULES).alerts.map(&:rule)
    assert_equal 3, RegulatoryAlerts.new(@map, rules: RULES).as_json[:rulesCount]
  end

  test "the seeded Wallonia rules come from the region settings" do
    load Rails.root.join("db/seeds/50_regulatory_rules.rb")
    @map.region.reload
    shed = @map.features.create!(layer: "structures", kind: "shed", geometry: rectangle(4.903 + 0.00001, 50.341, 6, 5))
    pond(rectangle(*middle, 11, 11))

    alerts = RegulatoryAlerts.new(@map).alerts
    assert_equal %w[pond_max_area small_building_max_area construction_boundary_distance], alerts.map(&:rule)
    assert_equal [ shed.id ], alerts.last.feature_ids
    assert_equal "Cabane ou remise de 30 m²", alerts.second.title
    assert alerts.all? { |a| a.source["url"].start_with?("https://territoire.wallonie.be/") }
  end
end
