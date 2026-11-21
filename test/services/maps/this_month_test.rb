require "test_helper"

class Maps::ThisMonthTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @point = RGeo::Geographic.spherical_factory(srid: 4326).point(4.906, 50.341)
    @map.features.create!(layer: "plants", kind: "plant", name: "Pommier", geometry: @point, properties: { "species_id" => plant_species(:apple).id })
  end

  def this_month(today) = Maps::ThisMonth.new(@map, today:).as_json

  test "what the placed plants do this month, from the catalogue" do
    april = this_month(Date.new(2026, 4, 14))
    assert_equal 4, april[:month]
    assert_equal "avril", april[:month_name]
    assert_equal 1, april[:plants][:flowering][:count]
    assert_equal 0, april[:plants][:harvest][:count]

    september = this_month(Date.new(2026, 9, 1))
    assert_equal 1, september[:plants][:harvest][:count]
  end

  test "the month's signs, the ones still to go and see first named in unobserved" do
    today = Date.new(2026, 11, 21)
    @map.features.create!(layer: "notes", kind: "season_sign", geometry: @point, properties: { "sign" => "first_frost", "observed_at" => "2026-10-30T07:00:00Z" })
    @map.features.create!(layer: "notes", kind: "season_sign", geometry: @point, properties: { "sign" => "leaf_fall", "observed_at" => "2024-11-02T09:00:00Z" })
    json = this_month(today)
    assert_equal %w[first_frost frost_pocket leaf_fall], json[:signs].map { _1[:sign] }
    frost = json[:signs].first
    assert_equal "Premier gel", frost[:label]
    assert_equal "2026-10-30", frost[:last_seen_on]
    assert frost[:seen_this_year]
    assert_match "givre", frost[:hint]
    leaf = json[:signs].last
    assert_equal "2024-11-02", leaf[:last_seen_on]
    refute leaf[:seen_this_year]
    assert_equal %w[frost_pocket leaf_fall], json[:unobserved]
  end
end
