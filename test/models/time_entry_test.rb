require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# Hours on a project: what is valid, who may log them, the envelopes of the
# accepted offer and the « relevé de prestations ».
class TimeEntryTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @designer = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @designer ])
    @map.update!(organization: @team)
  end

  def entry(**attributes)
    TimeEntry.new({ map: @map, user: @designer, worked_on: Date.current, minutes: 90, phase: "design" }.merge(attributes))
  end

  test "durations go by quarter hours, within a day" do
    assert entry.valid?
    refute entry(minutes: 50).valid?
    refute entry(minutes: 0).valid?
    refute entry(minutes: 25 * 60).valid?
  end

  test "a non-billable line says why, and the reason goes when it becomes billable again" do
    refute entry(billable: false).valid?
    assert entry(billable: false, non_billable_reason: "travel").valid?
    refute entry(billable: false, non_billable_reason: "volunteering").valid?
    line = entry(billable: true, non_billable_reason: "offered")
    assert line.valid?
    assert_nil line.non_billable_reason
  end

  test "next month is not work done, and a phase comes from the offer's or commercial" do
    refute entry(worked_on: Date.current + 30).valid?
    refute entry(phase: "maintenance").valid?
    assert entry(phase: "commercial").valid?
  end

  test "the team logs time, never the map's viewer; a personal map has no timesheet" do
    assert TimeEntry.usable_by?(@map, @designer)
    refute TimeEntry.usable_by?(@map, users(:alice))
    @map.update!(organization: nil)
    refute TimeEntry.shown_to?(@map, users(:michael))
    users(:michael).update!(account_kind: "professional")
    assert TimeEntry.usable_by?(@map, users(:michael))
    assert_equal [ @map ], TimeEntry.maps_for(users(:michael))
  end

  test "envelopes come from the last accepted version, shared by the phase, and overruns are computed" do
    offer = Offer.build_for(@map)
    offer.save!
    version = offer.save_version!(user: users(:michael))
    version.update!(status: "accepted")
    design = version.result["phases"].find { _1["key"] == "design" }
    envelope = design["hours_min"].to_f
    assert envelope.positive?

    entry(minutes: ((envelope + 2) * 60).round / 15 * 15).save!
    entry(user: users(:michael), minutes: 60, billable: false, non_billable_reason: "offered").save!
    phases = TimeEntry::Envelopes.new(@map).phases.index_by { _1[:key] }
    assert_equal envelope, phases["design"][:envelopeHours]
    assert phases["design"][:overHours] > 2
    assert_equal 1.0, phases["design"][:nonBillableHours]
    assert_nil phases["commercial"][:envelopeHours]
    people = TimeEntry::Envelopes.new(@map).people
    assert_equal [ @designer.id, users(:michael).id ], people.map { _1[:userId] }
  end

  test "the statement lists one recipient's billable hours and invoicing locks them" do
    entry(bill_to: "Semisto", trip_km: 64, trip_from: "Yvoir", trip_to: "Erpent").save!
    entry(bill_to: "Semisto", billable: false, non_billable_reason: "travel").save!
    entry(bill_to: "Autre ASBL").save!
    statement = TimeEntry::Statement.new(user: @designer, bill_to: "Semisto")
    json = statement.as_json
    assert_equal 90, json[:totals][:minutes]
    assert_equal 64.0, json[:totals][:km]
    assert_equal 1, json[:nonBillable].size
    assert_equal [ @map.name ], json[:projects].map { _1[:name] }

    assert_equal 1, statement.invoice!(number: "2026-041")
    assert_equal 1, @designer.time_entries.invoiced.count
    assert_equal "2026-041", @designer.time_entries.invoiced.sole.invoice_number
    assert_equal 0, TimeEntry::Statement.new(user: @designer, bill_to: "Semisto").billable.size
  end
end
