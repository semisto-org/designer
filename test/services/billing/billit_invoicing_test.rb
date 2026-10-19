require "test_helper"

class Billing::BillitInvoicingTest < ActiveSupport::TestCase
  API = "https://api.sandbox.billit.be/v1".freeze

  # Stripe stand-in: the invoice of the payment, as the webhook would read it.
  class FakeGateway
    attr_reader :invoice

    def initialize(invoice) = @invoice = invoice
    def retrieve_invoice(_id, expand: []) = @invoice
  end

  setup do
    @user = users(:bob)
    @billit = Providers::Billit.new(api_key: "key-123", party_id: "42")
    @payment = @user.billing_payments.create!(
      plan_key: "bureau", amount_cents: 12_900, tax_cents: 2_239, paid_at: Time.zone.parse("2026-10-18 10:00"),
      livemode: false, stripe_invoice_id: "in_1", stripe_customer_id: "cus_1"
    )
  end

  def stripe_invoice(tax_ids: [ { "type" => "eu_vat", "value" => "BE0790631657" } ], country: "BE")
    {
      "id" => "in_1", "number" => "STR-0001", "customer_name" => "Atelier Vert SRL", "customer_email" => "compta@atelier-vert.be",
      "customer_address" => { "line1" => "Rue de la Station 12", "postal_code" => "5530", "city" => "Yvoir", "country" => country },
      "customer_tax_ids" => tax_ids,
      "lines" => { "data" => [ { "period" => { "start" => Time.zone.parse("2026-10-18").to_i, "end" => Time.zone.parse("2026-11-18").to_i } } ] }
    }
  end

  def invoicing(invoice = stripe_invoice) = Billing::BillitInvoicing.new(billit: @billit, gateway: FakeGateway.new(invoice))

  def stub_no_existing_order(reference = "terranova-in_1")
    stub_request(:get, "#{API}/orders").with(query: { "$filter" => "ExternalProviderID eq '#{reference}'" }).to_return(body: { Items: [] }.to_json)
  end

  def stub_order(id, number) = stub_request(:get, "#{API}/orders/#{id}").to_return(body: { OrderID: id, OrderNumber: number }.to_json)

  def stub_peppol(registered: true)
    stub_request(:get, "#{API}/peppol/participantInformation/BE0790631657")
      .to_return(body: { Registered: registered, DocumentTypes: registered ? %w[BISv3Invoice BISv3CreditNote] : [] }.to_json)
  end

  def stub_send(transport, id) = stub_request(:post, "#{API}/orders/commands/send").with(body: { Transporttype: transport, OrderIDs: [ id ] }.to_json).to_return(body: "")

  test "a Belgian business gets a paid invoice in Billit, sent over Peppol, matching Stripe to the cent" do
    stub_no_existing_order
    create = stub_request(:post, "#{API}/orders").with(headers: { "Idempotency-Key" => "terranova-in_1" }) { |request|
      body = JSON.parse(request.body)
      body["OrderType"] == "Invoice" && body["Paid"] == true && body["PaidDate"] == "2026-10-18T00:00:00" &&
        body["PaymentMethod"] == "Online" && body["ExternalProviderID"] == "terranova-in_1" &&
        body.dig("Customer", "VATNumber") == "BE0790631657" && body.dig("Customer", "Name") == "Atelier Vert SRL" &&
        body.dig("Customer", "Addresses", 0, "City") == "Yvoir" &&
        body["OrderLines"] == [ { "Quantity" => 1, "Description" => "Semisto Terranova, formule Team",
                                  "DescriptionExtended" => "Du 18 octobre 2026 au 18 novembre 2026",
                                  "InclLeading" => true, "TotalIncl" => 129.0, "VATPercentage" => 21 } ] &&
        body["VatGroups"] == [ { "VATPercentage" => 21, "TotalExcl" => 106.61, "TotalVAT" => 22.39, "TotalIncl" => 129.0 } ] &&
        body["Comments"].include?("STR-0001")
    }.to_return(body: "501")
    stub_order(501, "2026-0007")
    stub_peppol
    send = stub_send("Peppol", 501)

    document = invoicing.invoice(@payment)

    assert_requested create
    assert_requested send
    assert_equal %w[sent 2026-0007 Peppol], [ document.status, document.order_number, document.transport ]
    assert_equal 501, document.billit_order_id
  end

  test "a business that is not on Peppol yet gets the invoice by e-mail, through Billit" do
    stub_no_existing_order
    stub_request(:post, "#{API}/orders").to_return(body: "502")
    stub_order(502, "8")
    stub_peppol(registered: false)
    send = stub_send("SMTP", 502)
    assert_equal "SMTP", invoicing.invoice(@payment).transport
    assert_requested send
  end

  test "private persons and businesses outside Belgium keep their Stripe invoice" do
    assert_equal "skipped", invoicing(stripe_invoice(tax_ids: [])).invoice(@payment).status
    other = @user.billing_payments.create!(plan_key: "atelier", amount_cents: 44_100, tax_cents: 0, paid_at: Time.current, livemode: false, stripe_invoice_id: "in_2")
    french = stripe_invoice(tax_ids: [ { "type" => "eu_vat", "value" => "FR40303265045" } ], country: "FR")
    assert_equal "skipped", invoicing(french).invoice(other).status
    assert_not_requested :any, /billit/
  end

  test "test payments never reach Billit's production, nor live payments its sandbox, nor invoice requests" do
    production = Billing::BillitInvoicing.new(billit: Providers::Billit.new(api_key: "k", party_id: "1", url: "https://api.billit.be"), gateway: FakeGateway.new(stripe_invoice))
    assert_nil production.invoice(@payment)
    @payment.update_columns(livemode: true)
    assert_nil invoicing.invoice(@payment)
    refute invoicing.applicable?(BillingPayment.new(@payment.attributes.merge("id" => nil, "livemode" => false, "invoice_request_id" => 1)))
    assert invoicing.applicable?(BillingPayment.new(@payment.attributes.merge("id" => nil, "livemode" => false)))
    assert_not_requested :any, /billit/
  end

  test "an order a lost response already created is found, not created twice" do
    stub_request(:get, "#{API}/orders").with(query: { "$filter" => "ExternalProviderID eq 'terranova-in_1'" })
      .to_return(body: { Items: [ { OrderID: 503 } ] }.to_json)
    stub_order(503, "9")
    stub_peppol
    stub_send("Peppol", 503)
    assert_equal "9", invoicing.invoice(@payment).order_number
    assert_not_requested :post, "#{API}/orders"
  end

  test "a failure is kept on the document and tried again later" do
    stub_no_existing_order
    stub_request(:post, "#{API}/orders").to_return(status: 500, body: "")
    document = invoicing.invoice(@payment)
    assert_equal "pending", document.status
    assert_equal 1, document.attempts
    assert_match "HTTP 500", document.last_error

    stub_request(:post, "#{API}/orders").to_return(body: "504")
    stub_order(504, "10")
    stub_peppol
    stub_send("Peppol", 504)
    assert_equal "sent", invoicing.invoice(@payment.reload).status
    assert_equal 1, @payment.billit_documents.count
  end

  test "a sent invoice is left alone" do
    @payment.billit_documents.create!(kind: "invoice", status: "sent", idempotency_key: "terranova-in_1", amount_cents: 12_900, order_number: "1")
    invoicing.invoice(@payment)
    assert_not_requested :any, /billit/
  end

  test "each new refund gets a credit note for the refunded part, about the invoice" do
    @payment.billit_documents.create!(kind: "invoice", status: "sent", idempotency_key: "terranova-in_1", amount_cents: 12_900, tax_cents: 2_239,
      order_number: "11", billit_order_id: 505, customer_vat_number: "BE0790631657")
    @payment.update_columns(refunded_cents: 5_000)
    stub_no_existing_order("terranova-cn-in_1-5000")
    create = stub_request(:post, "#{API}/orders").with(headers: { "Idempotency-Key" => "terranova-cn-in_1-5000" }) { |request|
      body = JSON.parse(request.body)
      body["OrderType"] == "CreditNote" && body["AboutInvoiceNumber"] == "11" && !body.key?("Paid") &&
        body["VatGroups"] == [ { "VATPercentage" => 21, "TotalExcl" => 41.32, "TotalVAT" => 8.68, "TotalIncl" => 50.0 } ]
    }.to_return(body: "506")
    stub_order(506, "1")
    stub_peppol
    stub_send("Peppol", 506)

    notes = invoicing.credit(@payment)
    assert_requested create
    assert_equal [ [ 5_000, 868, "sent" ] ], notes.map { |note| [ note.amount_cents, note.tax_cents, note.status ] }
    assert_empty invoicing.credit(@payment), "nothing more to credit"

    @payment.update_columns(refunded_cents: 12_900)
    stub_no_existing_order("terranova-cn-in_1-12900")
    stub_request(:post, "#{API}/orders").to_return(body: "507")
    stub_order(507, "2")
    stub_send("Peppol", 507)
    assert_equal [ 7_900 ], invoicing.credit(@payment).map(&:amount_cents)
  end

  test "no credit note without a Billit invoice" do
    @payment.update_columns(refunded_cents: 12_900)
    assert_empty invoicing.credit(@payment)
    @payment.billit_documents.create!(kind: "invoice", status: "skipped", idempotency_key: "terranova-in_1", amount_cents: 12_900)
    assert_empty invoicing.credit(@payment)
  end

  test "reads whether a sent document was delivered or refused" do
    delivered = @payment.billit_documents.create!(kind: "invoice", status: "sent", idempotency_key: "a", amount_cents: 1, billit_order_id: 600, order_number: "1")
    refused = @payment.billit_documents.create!(kind: "credit_note", status: "sent", idempotency_key: "b", amount_cents: 1, billit_order_id: 601, order_number: "2")
    stub_request(:get, "#{API}/orders/600").to_return(body: { CurrentDocumentDeliveryDetails: { DocumentDeliveryStatus: "Delivered", DocumentDeliveryDate: "2026-10-18T22:15:32" } }.to_json)
    stub_request(:get, "#{API}/orders/601").to_return(body: { CurrentDocumentDeliveryDetails: { DocumentDeliveryStatus: "Refused", DocumentRefusedInfo: "Unknown buyer" } }.to_json)

    assert_equal "delivered", invoicing.refresh(delivered).status
    assert delivered.delivered_at
    assert_equal "refused", invoicing.refresh(refused).status
    assert_match "Unknown buyer", refused.last_error
  end
end
