module Providers
  module Climate
    # The interface every climate provider implements. A capability a
    # provider does not offer answers Result.unavailable(:not_supported).
    #
    #   current_normals(point)                         -> Result (normals, hardiness zone)
    #   projection(point, horizon: 2050, scenario: "high") -> Result (deltas, projected zone)
    #   forecast(point)                                -> Result (daily forecast)
    #
    # Points are anything Point.from accepts. Results that come back
    # available are cached with Rails.cache (see #cached).
    class Provider
      HORIZONS = %w[2050 2080].freeze
      SCENARIOS = %w[moderate high].freeze

      def key = self.class.name.demodulize.underscore

      def supports?(_capability) = false

      def capabilities = CAPABILITIES.index_with { |capability| supports?(capability) }

      def current_normals(_point) = unavailable(:not_supported)

      def projection(_point, horizon:, scenario:)
        validate_projection!(horizon, scenario)
        unavailable(:not_supported)
      end

      def forecast(_point) = unavailable(:not_supported)

      private
        def unavailable(reason) = Result.unavailable(reason, provider: key)

        def ok(data) = Result.ok(data, provider: key)

        def validate_projection!(horizon, scenario)
          raise ArgumentError, "unknown horizon #{horizon.inspect}" unless HORIZONS.include?(horizon.to_s)
          raise ArgumentError, "unknown scenario #{scenario.inspect}" unless SCENARIOS.include?(scenario.to_s)
        end

        # Caches the data of available results only: an upstream error is
        # retried on the next request instead of being remembered.
        def cached(*parts, expires_in:)
          cache_key = [ "climate", key, *parts ]
          hit = Rails.cache.read(cache_key)
          return ok(hit) unless hit.nil?

          result = yield
          Rails.cache.write(cache_key, result.data, expires_in:) if result.available?
          result
        end
    end
  end
end
