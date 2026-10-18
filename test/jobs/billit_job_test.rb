require "test_helper"

class BillitJobTest < ActiveJob::TestCase
  # Records the payments it is asked about instead of calling Billit.
  class RecordingInvoicing
    attr_reader :invoiced, :credited, :refreshed

    def initialize = (@invoiced, @credited, @refreshed = [], [], [])
    def invoice(payment) = @invoiced << payment.id
    def credit(payment) = @credited << payment.id
    def refresh(document) = @refreshed << document.id
  end

  setup do
    @user = users(:bob)
    @billit = Providers::Billit.new(api_key: "key-123", party_id: "42")
  end

  def payment(**attributes)
    @user.billing_payments.create!({ plan_key: "bureau", amount_cents: 12_900, tax_cents: 2_239, paid_at: 1.hour.ago, livemode: false,
                                     stripe_invoice_id: "in_#{SecureRandom.hex(4)}" }.merge(attributes))
  end

  test "a payment is queued for Billit when its Stripe invoice is known or it is refunded, only once Billit is configured" do
    assert_no_enqueued_jobs(only: BillitJob) { payment }

    with_env("BILLIT_API_KEY" => "key-123", "BILLIT_PARTY_ID" => "42") do
      assert_enqueued_with(job: BillitJob) { payment }
      assert_no_enqueued_jobs(only: BillitJob) { payment(stripe_invoice_id: nil) }
      refunded = payment
      assert_enqueued_with(job: BillitJob) { refunded.update!(refunded_cents: 1_000) }
      assert_no_enqueued_jobs(only: BillitJob) { refunded.update!(hosted_invoice_url: "https://invoice.stripe.com/i/1") }
    end
  end

  test "the backfill picks recent payments without a document, failed documents and new refunds" do
    fresh = payment
    old = payment(paid_at: 10.days.ago)
    live = payment(livemode: true)
    done = payment
    done.billit_documents.create!(kind: "invoice", status: "sent", idempotency_key: "k-done", amount_cents: 12_900, order_number: "1", sent_at: 1.hour.ago)
    failed = payment(paid_at: 20.days.ago)
    failed.billit_documents.create!(kind: "invoice", status: "pending", idempotency_key: "k-failed", amount_cents: 12_900, attempts: 2)
    refunded = payment(paid_at: 20.days.ago, refunded_cents: 5_000)
    refunded.billit_documents.create!(kind: "invoice", status: "delivered", idempotency_key: "k-refunded", amount_cents: 12_900, order_number: "2")
    given_up = payment(paid_at: 20.days.ago)
    given_up.billit_documents.create!(kind: "invoice", status: "pending", idempotency_key: "k-given-up", amount_cents: 12_900, attempts: BillitDocument::MAX_ATTEMPTS)

    invoicing = RecordingInvoicing.new
    assert_equal 3, BillitJob.backfill(billit: @billit, invoicing:)

    assert_equal [ fresh, failed, refunded ].map(&:id).sort, invoicing.invoiced.sort
    assert_not_includes invoicing.invoiced, old.id
    assert_not_includes invoicing.invoiced, live.id
    assert_equal [ done.billit_documents.first.id ], invoicing.refreshed
  end

  test "the backfill does nothing while Billit is not configured" do
    payment
    assert_equal 0, BillitJob.backfill(billit: Providers::Billit.new(api_key: nil, party_id: nil))
  end

  private
    def with_env(values)
      previous = values.keys.index_with { |key| ENV[key] }
      values.each { |key, value| ENV[key] = value }
      yield
    ensure
      previous.each { |key, value| ENV[key] = value }
    end
end
