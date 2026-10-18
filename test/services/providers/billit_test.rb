require "test_helper"

class Providers::BillitTest < ActiveSupport::TestCase
  API = "https://api.sandbox.billit.be/v1".freeze
  HEADERS = { "ApiKey" => "key-123", "PartyID" => "42" }.freeze

  def billit(**options) = Providers::Billit.new(api_key: "key-123", party_id: "42", **options)

  test "is configured with a key and a PartyID, and points to the sandbox by default" do
    assert billit.configured?
    refute billit.production?
    refute Providers::Billit.new(api_key: "key-123", party_id: nil).configured?
    assert billit(url: "https://api.billit.be").production?
    assert_raises(Providers::Billit::Error) { Providers::Billit.new(api_key: nil, party_id: nil).order(1) }
  end

  test "creates an order with the idempotency key and returns its id" do
    stub_request(:post, "#{API}/orders").with(headers: HEADERS.merge("Idempotency-Key" => "terranova-in_1"), body: { OrderType: "Invoice" }.to_json)
      .to_return(body: "3412211")
    assert_equal 3_412_211, billit.create_order({ OrderType: "Invoice" }, idempotency_key: "terranova-in_1")
  end

  test "a reused idempotency key is a duplicate, other errors carry Billit's code" do
    stub_request(:post, "#{API}/orders").to_return(status: 409, body: { errors: [ { Code: "Idempotent token already exists" } ] }.to_json)
    error = assert_raises(Providers::Billit::Error) { billit.create_order({}, idempotency_key: "k") }
    assert error.duplicate?

    stub_request(:post, "#{API}/orders").to_return(status: 400, body: { errors: [ { Code: "ThePaymentMethod_0_IsInvalid", Description: "invalide" } ] }.to_json)
    error = assert_raises(Providers::Billit::Error) { billit.create_order({}, idempotency_key: "k2") }
    refute error.duplicate?
    assert_equal "ThePaymentMethod_0_IsInvalid", error.code
  end

  test "a company can receive over Peppol when it takes invoices and credit notes" do
    stub_request(:get, "#{API}/peppol/participantInformation/BE0790631657")
      .to_return(body: { Registered: true, DocumentTypes: %w[BISv3Invoice BISv3CreditNote] }.to_json)
    stub_request(:get, "#{API}/peppol/participantInformation/BE0123456749").to_return(body: { Registered: false, DocumentTypes: [] }.to_json)
    assert billit.peppol_receiver?("BE0790631657")
    refute billit.peppol_receiver?("BE0123456749")
  end

  test "finds an order by its external reference and sends orders with a transport" do
    stub_request(:get, "#{API}/orders").with(query: { "$filter" => "ExternalProviderID eq 'terranova-in_1'" })
      .to_return(body: { Items: [ { OrderID: 7, OrderNumber: "12" } ] }.to_json)
    assert_equal 7, billit.find_by_external_id("terranova-in_1")["OrderID"]

    send = stub_request(:post, "#{API}/orders/commands/send").with(body: { Transporttype: "Peppol", OrderIDs: [ 7 ] }.to_json).to_return(body: "")
    assert billit.send_orders([ 7 ], transport: "Peppol")
    assert_requested send
  end
end
