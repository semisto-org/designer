module Providers
  # Billit (billit.be), Semisto's invoicing software: it holds the legal
  # invoice of a sale to a Belgian business and sends it over Peppol, the
  # Belgian e-invoicing network (mandatory between businesses since 2026).
  # API documentation: https://docs.billit.be (every page also as `.md`).
  #
  #   billit = Providers::Billit.new
  #   billit.peppol_receiver?("BE0790631657")         # => true
  #   id = billit.create_order(payload, idempotency_key: "terranova-in_123")
  #   billit.send_orders([ id ], transport: "Peppol")
  #   billit.order(id)["CurrentDocumentDeliveryDetails"]
  #
  # Authentication is an API key and the company's PartyID, which Billit
  # allows for an organisation automating its own administration. Both
  # differ between the sandbox (my.sandbox.billit.be) and production.
  #
  # ENV: BILLIT_API_KEY, BILLIT_PARTY_ID (without either, `configured?` is
  #      false and no Billit invoice is made), BILLIT_API_URL (default: the
  #      sandbox; https://api.billit.be in production).
  class Billit
    class Error < StandardError
      attr_reader :status, :code

      def initialize(message, status: nil, code: nil)
        @status = status
        @code = code
        super(message)
      end

      # The idempotency key was already used by a request that succeeded.
      def duplicate? = status == 409
    end

    SANDBOX_URL = "https://api.sandbox.billit.be".freeze
    PRODUCTION_URL = "https://api.billit.be".freeze

    def self.configured? = new.configured?

    def initialize(api_key: ENV["BILLIT_API_KEY"], party_id: ENV["BILLIT_PARTY_ID"], url: ENV["BILLIT_API_URL"].presence || SANDBOX_URL, connection: nil)
      @api_key = api_key.presence
      @party_id = party_id.presence
      @base_url = url.to_s.chomp("/")
      @connection = connection
    end

    def configured? = @api_key.present? && @party_id.present?

    # Live Stripe payments go to Billit's production, test payments to its sandbox.
    def production? = @base_url == PRODUCTION_URL

    # Whether a company (VAT number "BE0790631657" or company number) can
    # receive invoices and credit notes over Peppol.
    def peppol_receiver?(identifier)
      body = request(:get, "v1/peppol/participantInformation/#{ERB::Util.url_encode(identifier)}")
      types = Array(body["DocumentTypes"])
      body["Registered"] == true && types.include?("BISv3Invoice") && types.include?("BISv3CreditNote")
    end

    # Creates an invoice or a credit note; returns Billit's OrderID. A second
    # request with the same key raises an Error whose `duplicate?` is true.
    def create_order(payload, idempotency_key:)
      request(:post, "v1/orders", payload, "Idempotency-Key" => idempotency_key).to_i
    end

    def order(id) = request(:get, "v1/orders/#{id.to_i}")

    # The order made for an external reference (a Stripe id), or nil.
    def find_by_external_id(reference)
      filter = "ExternalProviderID eq '#{reference.to_s.delete("'")}'"
      Array(request(:get, "v1/orders", nil, {}, { "$filter" => filter })["Items"]).first
    end

    # transport: "Peppol" (fails when the customer is not on Peppol) or "SMTP" (e-mail).
    def send_orders(ids, transport:)
      request(:post, "v1/orders/commands/send", { Transporttype: transport, OrderIDs: ids.map(&:to_i) })
      true
    end

    private
      def request(method, path, body = nil, headers = {}, params = {})
        raise Error, "BILLIT_API_KEY or BILLIT_PARTY_ID is not set" unless configured?
        response = connection.run_request(method, path, body&.to_json, headers) { |req| req.params.update(params) }
        parsed = response.body.present? ? JSON.parse(response.body) : nil
        return parsed if response.success?

        error = Array(parsed.is_a?(Hash) && parsed["errors"]).first || {}
        code = error["Code"]
        raise Error.new([ "#{path}: HTTP #{response.status}", code, error["Description"] ].compact.join(" — "), status: response.status, code:)
      rescue Faraday::Error, JSON::ParserError => e
        raise Error, "#{path}: #{e.message}"
      end

      def connection
        @connection ||= Faraday.new(url: "#{@base_url}/", headers: {
          "ApiKey" => @api_key.to_s, "PartyID" => @party_id.to_s,
          "Accept" => "application/json", "Content-Type" => "application/json"
        }) do |f|
          f.options.open_timeout = 5
          f.options.timeout = 20
        end
      end
  end
end
