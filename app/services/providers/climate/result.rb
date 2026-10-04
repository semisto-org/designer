module Providers
  module Climate
    # Outcome of a provider call: the data, or why there is none.
    #   not_configured  no data or credentials for this region / instance
    #   not_supported   this provider does not offer the capability
    #   no_location     the map has no location yet (no outline drawn)
    #   upstream_error  the remote service failed or timed out
    class Result
      REASONS = %i[not_configured not_supported no_location upstream_error].freeze

      attr_reader :data, :reason, :provider

      def self.ok(data, provider:) = new(data:, reason: nil, provider:)

      def self.unavailable(reason, provider: nil)
        raise ArgumentError, "unknown reason #{reason.inspect}" unless REASONS.include?(reason)
        new(data: nil, reason:, provider:)
      end

      def initialize(data:, reason:, provider:)
        @data = data
        @reason = reason
        @provider = provider
      end

      def available? = reason.nil?
    end
  end
end
