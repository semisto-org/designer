require "test_helper"

class Climate::PlantCheckTest < ActiveSupport::TestCase
  def check(**traits) = Climate::PlantCheck.new(Climate::PlantTraits.new(**traits))

  def projection(extreme_min_c:, summer_precip: -5.0, summer_temp: 1.5)
    {
      extreme_min_c:,
      zone: HardinessZone.for_temperature(extreme_min_c).as_json,
      deltas: { summer_precip_pct: [ nil, summer_precip, nil ], summer_temp_c: [ nil, summer_temp, nil ] }
    }
  end

  test "cold today: at risk below the plant's limit, borderline within 2 °C" do
    site = { extreme_min_c: -12.5 }
    assert_equal({ status: "at_risk", margin_c: -2.5, risks: [ "cold" ] }, check(min_temperature_c: -10).today(site))
    assert_equal "borderline", check(min_temperature_c: -14).today(site)[:status]
    assert_equal "ok", check(min_temperature_c: -20).today(site)[:status]
    assert_equal({ status: "unknown", margin_c: nil, risks: [] }, check.today(site))
  end

  test "warming can make a frost-tender plant suitable" do
    fig = check(min_temperature_c: -10)
    assert_equal "at_risk", fig.today(extreme_min_c: -12.5)[:status]
    assert_equal({ status: "ok", risks: [] }, fig.future(projection(extreme_min_c: -7.5)))
  end

  test "heat: projected zone beyond the plant's warmest zone" do
    birch = check(min_temperature_c: -40, max_zone: HardinessZone.parse("7"))
    future = birch.future(projection(extreme_min_c: -10.5)) # 8a
    assert_equal "at_risk", future[:status]
    assert_equal [ "heat" ], future[:risks]
    assert_equal "borderline", birch.future(projection(extreme_min_c: -13))[:status] # 7b
  end

  test "drought: sensitive plants under drier or hotter summers" do
    willow = check(min_temperature_c: -30, drought: :sensitive)
    assert_equal [ "drought" ], willow.future(projection(extreme_min_c: -8, summer_precip: -20))[:risks]
    assert_equal "at_risk", willow.future(projection(extreme_min_c: -8, summer_precip: 0, summer_temp: 3))[:status]
    assert_equal "borderline", willow.future(projection(extreme_min_c: -8, summer_precip: -5, summer_temp: 1))[:status]
    assert_equal "ok", check(min_temperature_c: -30, drought: :tolerant).future(projection(extreme_min_c: -8, summer_precip: -30))[:status]
  end

  test "only the cold check when nothing else is known" do
    assert_equal({ status: "ok", risks: [] }, check(min_temperature_c: -25).future(projection(extreme_min_c: -8, summer_precip: -30)))
    assert_equal "unknown", check.future(projection(extreme_min_c: -8))[:status]
  end
end
