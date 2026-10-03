module Mcp
  # Bridge to the region's identify provider (Providers::ArcgisIdentify): the
  # same answers as a click on the map. Raises Unavailable when the upstream
  # cannot answer for a layer, so the tool reports it instead of failing.
  module RegionIdentify
    class Unavailable < StandardError; end

    # The click tolerance is sized for this zoom (garden scale).
    ZOOM = 18
    MAX_RESULT_BYTES = 20_000

    def self.identify(map:, layer:, lng:, lat:)
      result = Providers::ArcgisIdentify.new([ layer ]).call(lng:, lat:, zoom: ZOOM).first
      raise Unavailable if result.nil? || result.status == "unavailable"
      normalize(result.as_json)
    end

    def self.normalize(data)
      json = data.to_json
      json.bytesize > MAX_RESULT_BYTES ? { "truncated" => true, "excerpt" => json.byteslice(0, MAX_RESULT_BYTES).scrub("") } : data
    end
  end
end
