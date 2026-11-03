require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::FirstHourMissionsTest < ActiveSupport::TestCase
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @map.features.where(kind: [ "season_sign", "storm_observation" ]).delete_all
    @map.bioindicator_observations.delete_all
    @map.photos.update_all(bioindicator_status: nil)
  end

  def point = RGeo::Geographic.spherical_factory(srid: 4326).point(4.906, 50.341)

  def note(kind, properties = {}, status: "active", layer: "notes")
    @map.features.create!(layer:, kind:, properties:, status:, geometry: point)
  end

  def missions = Maps::FirstHourMissions.new(@map).missions.index_by { _1[:key] }

  test "nothing seen yet: three missions to do" do
    assert_equal %w[water season living], Maps::FirstHourMissions.new(@map).missions.pluck(:key)
    refute Maps::FirstHourMissions.new(@map).done?
    assert missions.values.none? { _1[:done] }
  end

  test "a puddle or a downpour is the water, another sign is the season" do
    note("season_sign", { "sign" => "puddle" })
    assert missions["water"][:done]
    refute missions["season"][:done]

    note("season_sign", { "sign" => "frost_pocket" })
    note("storm_observation", layer: "water")
    assert_equal 2, missions["water"][:count]
    assert missions["season"][:done]
  end

  test "a draft from the AI counts for nothing" do
    note("season_sign", { "sign" => "nest" }, status: "draft")
    refute missions["season"][:done]
  end

  test "three wild plants, noted or waiting on a photo, are the living" do
    2.times { |i| @map.bioindicator_observations.create!(species_name: "Ortie #{i}", abundance: "present") }
    refute missions["living"][:done]
    assert_equal 2, missions["living"][:count]

    create_photo(bioindicator_status: "to_analyze")
    assert missions["living"][:done]
  end

  test "shown during the first weeks after « Voici ton lieu »" do
    @map.update_column(:first_hour_started_at, nil)
    refute Maps::FirstHourMissions.new(@map).shown?
    @map.update_column(:first_hour_started_at, 2.days.ago)
    assert Maps::FirstHourMissions.new(@map).shown?
    @map.update_column(:first_hour_started_at, 31.days.ago)
    refute Maps::FirstHourMissions.new(@map).shown?
  end

  test "names the signs worth going out for this month" do
    data = Maps::FirstHourMissions.new(@map, now: Time.zone.local(2026, 11, 2)).as_json
    assert_includes data[:signs], "first_frost"
    assert(Maps::FirstHourMissions::SIGNS_BY_MONTH.values.flatten.all? { I18n.exists?("drawing.options.sign.#{_1}", :fr) })
  end
end
