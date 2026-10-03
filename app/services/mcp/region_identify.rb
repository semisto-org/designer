module Mcp
  # Bridge to the Géoportail identify provider (Providers::Geoportail, built
  # by the map data feature). While that provider is missing, not configured
  # or unreachable, the identify tool says so instead of failing.
  module RegionIdentify
    class Unavailable < StandardError; end

    PROVIDER = "Providers::Geoportail"
    MAX_RESULT_BYTES = 20_000

    def self.provider
      PROVIDER.safe_constantize
    end

    def self.available?
      klass = provider
      return false unless klass
      %i[available? configured? enabled?].each do |check|
        return klass.public_send(check) if klass.respond_to?(check)
      end
      klass.respond_to?(:identify) || klass.method_defined?(:identify)
    end

    # Identifies what one region layer says at a point. Returns JSON-ready
    # data; raises Unavailable when the provider cannot answer.
    def self.identify(map:, layer:, lng:, lat:)
      raise Unavailable unless available?
      klass = provider
      values = {
        layer:, region_layer: layer, layer_key: layer.key, key: layer.key,
        lng:, lat:, lon: lng, longitude: lng, latitude: lat, point: [ lng, lat ], coordinates: [ lng, lat ],
        map:, region: map.region
      }
      target = klass.respond_to?(:identify) ? klass : FlexibleCall.instantiate(klass, values)
      normalize(FlexibleCall.invoke(target.method(:identify), values))
    rescue FlexibleCall::Mismatch => e
      Rails.logger.warn("[mcp] identify provider signature not understood: #{e.message}")
      raise Unavailable
    end

    def self.normalize(result)
      data = result.respond_to?(:as_json) ? result.as_json : result
      json = data.to_json
      json.bytesize > MAX_RESULT_BYTES ? { "truncated" => true, "excerpt" => json.byteslice(0, MAX_RESULT_BYTES).scrub("") } : data
    end
  end
end
