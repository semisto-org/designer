require "test_helper"

class PlantCorrectionTest < ActiveSupport::TestCase
  setup do
    @alder = plant_species(:alder)
    @alice = users(:alice)
    @reviewer = users(:michael)
  end

  test "keeps what the sheet said and changes nothing before a reviewer accepts" do
    correction = @alder.corrections.create!(user: @alice, field: "height_max_m", proposed_value: "25,5", note: "Flora Gallica")
    assert_equal 20.0, correction.current_value
    assert_equal 25.5, correction.proposed_value
    assert_equal 20, @alder.reload.height_max_m.to_i

    correction.accept!(@reviewer)
    assert_equal 25.5, @alder.reload.height_max_m.to_f
    assert_equal [ "user", "to_verify" ], @alder.provenance_for(:height_max_m).values_at(:source, :status)
    assert_equal [ "accepted", @reviewer ], [ correction.status, correction.reviewed_by ]
  end

  test "a strata, a name, a zone, and a value a reviewer had checked" do
    @alder.record_provenance!(%w[strata], source: "pfaf", status: "sourced")
    @alder.corrections.create!(user: @alice, field: "strata", proposed_value: "sub_canopy", note: "x", source_url: "https://example.org/aulne").accept!(@reviewer)
    assert_equal "sub_canopy", @alder.reload.strata
    assert_equal [ "user", "https://example.org/aulne" ], @alder.provenance_for(:strata).values_at(:source, :url)

    @alder.corrections.create!(user: @alice, field: "common_name", proposed_value: " Aulne glutineux ").accept!(@reviewer)
    assert_equal "Aulne glutineux", @alder.reload.common_name

    @alder.corrections.create!(user: @alice, field: "hardiness_zone", proposed_value: "4").accept!(@reviewer)
    assert_equal 4, @alder.reload.hardiness_zone
    assert @alder.min_temperature_c.present?
  end

  test "refuses a value that does not fit its field, and « autre chose » without a note" do
    assert_not @alder.corrections.new(user: @alice, field: "strata", proposed_value: "arbuste").valid?
    assert_not @alder.corrections.new(user: @alice, field: "height_max_m", proposed_value: "-1").valid?
    assert_not @alder.corrections.new(user: @alice, field: "hardiness_zone", proposed_value: "14").valid?
    assert_not @alder.corrections.new(user: @alice, field: "other").valid?
    assert_not @alder.corrections.new(user: @alice, field: "color", proposed_value: "x").valid?
    assert_not @alder.corrections.new(user: @alice, field: "other", note: "x", source_url: "pas une adresse").valid?

    other = @alder.corrections.create!(user: @alice, field: "other", note: "Les fleurs sont en mars", proposed_value: "ignoré")
    assert_nil other.proposed_value
    other.accept!(@reviewer)
    assert_equal "accepted", other.status
  end

  test "rejecting leaves the sheet as it was" do
    correction = @alder.corrections.create!(user: @alice, field: "strata", proposed_value: "shrub")
    correction.reject!(@reviewer)
    assert_equal [ "rejected", "canopy" ], [ correction.status, @alder.reload.strata ]
  end
end
