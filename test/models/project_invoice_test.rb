require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# An invoice sent to the client, recorded: what is valid, and who records it.
class ProjectInvoiceTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @map.update!(organization: @team)
  end

  def invoice(**attributes)
    @map.project_invoices.new({ user: users(:bob), number: "2026-042", issued_on: Date.current, services_cents: 180_000, vat_cents: 37_800 }.merge(attributes))
  end

  test "an invoice has a number, a date and at least one item" do
    assert invoice.valid?
    refute invoice(number: " ").valid?
    refute invoice(services_cents: 0).valid?
    refute invoice(plants_cents: -1).valid?
    refute invoice(issued_on: Date.current + 60).valid?
    refute invoice(paid_on: Date.current - 1).valid?
  end

  test "a number is recorded once per project, whatever its case" do
    invoice(number: "F-1").save!
    refute invoice(number: "f-1").valid?
    assert invoice(number: "F-2").valid?
  end

  test "it adds its items up, and only the project's team records it" do
    one = invoice(expenses_cents: 20_000, plants_cents: 50_000)
    assert_equal [ 250_000, 287_800 ], [ one.amount_cents, one.total_cents ]
    assert ProjectInvoice.writable_by?(@map, users(:bob))
    refute ProjectInvoice.writable_by?(@map, users(:alice))
    @map.update!(archived_at: Time.current)
    refute ProjectInvoice.writable_by?(@map, users(:bob))
  end

  test "the default VAT is 6 % on plants and 21 % on the rest" do
    assert_equal 21_000 + 600, ProjectInvoice.default_vat_cents("services" => 100_000, "plants" => 10_000)
  end

  test "only a PDF or a photo goes with it" do
    one = invoice
    one.document.attach(io: StringIO.new("hello"), filename: "f.txt", content_type: "text/plain")
    refute one.valid?
    one.document.attach(io: file_fixture("analyse_sol.pdf").open, filename: "f.pdf", content_type: "application/pdf")
    assert one.valid?
  end
end
