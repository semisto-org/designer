module Mcp
  # Bridge to the region's identify provider (Providers::ArcgisIdentify): the
  # same answers as a click on the map. Raises Unavailable when the upstream
  # cannot answer for a layer, so the tool reports it instead of failing.
  module RegionIdentify
    class Unavailable < StandardError; end

    # The click tolerance is sized for this zoom (garden scale).
    ZOOM = 18
    MAX_RESULT_BYTES = 20_000

    # A slow service (the SPW's ancient forests often takes more than the
    # map's 6 s) is asked once more, alone, with more time before the tool
    # says it did not answer.
    SLOW_TIMEOUT = 20

    def self.identify(layer:, lng:, lat:)
      result = Providers::ArcgisIdentify.new([ layer ]).call(lng:, lat:, zoom: ZOOM).first
      result = retry_slowly(layer, lng:, lat:) if result.nil? || result.status == "unavailable"
      raise Unavailable if result.nil? || result.status == "unavailable"
      normalize(result.as_json)
    end

    def self.retry_slowly(layer, lng:, lat:)
      raw = Providers::ArcgisIdentify.request(layer, lng:, lat:, zoom: ZOOM, timeout: SLOW_TIMEOUT)
      entries = Providers::ArcgisIdentify::Formatters.entries_for(layer.identify_formatter, raw)
      Providers::ArcgisIdentify::Result.new(key: layer.key, name: layer.name, status: entries.empty? ? "empty" : "ok", entries:)
    rescue Providers::GeoHttp::Error, Faraday::Error, JSON::ParserError
      nil
    end

    def self.normalize(data)
      json = data.to_json
      json.bytesize > MAX_RESULT_BYTES ? { "truncated" => true, "excerpt" => json.byteslice(0, MAX_RESULT_BYTES).scrub("") } : data
    end
  end
end
