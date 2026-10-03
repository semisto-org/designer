# "What is here?" on the map: asks the ArcGIS REST `identify` of every
# requested region layer (in parallel, short timeouts, cached), and turns
# the answers into displayable entries (ArcgisIdentify::Formatters).
#
#   Providers::ArcgisIdentify.new(layers).call(lng: 4.90, lat: 50.34, zoom: 17)
#   # => [Result(key: "sols", name: "Carte des sols", status: "ok", entries: [...]), ...]
#
# Status per layer: "ok" (entries), "empty" (nothing here), "unavailable"
# (timeout, upstream error, host not allowed).
#
# ArcGIS needs `mapExtent` + `imageDisplay` even for a point: tolerance is
# in screen pixels. We derive both from the zoom (a 101 px square around
# the point) instead of trusting the client's viewport, so answers are
# cacheable across users.
module Providers
  class ArcgisIdentify
    Result = Data.define(:key, :name, :status, :entries) do
      def as_json(*)
        {
          key:, name:, status:,
          entries: entries.map { |e| { text: e[:text], detail: e[:detail], href: e[:href], hrefLabel: e[:href_label] } }
        }
      end
    end

    IMAGE_SIZE = 101
    TIMEOUT = 6
    DEADLINE = 9
    CACHE_TTL = 12.hours

    def self.request(layer, lng:, lat:, zoom:, return_geometry: false, tolerance: nil, timeout: TIMEOUT)
      GeoHttp.ensure_allowed!(layer.identify_url)
      json = GeoHttp.get_json(layer.identify_url, params: params(layer, lng:, lat:, zoom:, return_geometry:, tolerance:), timeout:)
      raise GeoHttp::Unavailable, json.dig("error", "message").to_s if json["error"]
      Array(json["results"])
    end

    def self.params(layer, lng:, lat:, zoom:, return_geometry:, tolerance:)
      zoom = zoom.to_f.clamp(0, 22)
      half = IMAGE_SIZE / 2.0
      dlng = TileMath.degrees_per_pixel(zoom) * half
      dlat = dlng * Math.cos(lat * Math::PI / 180)
      {
        f: "json",
        geometry: "#{lng},#{lat}",
        geometryType: "esriGeometryPoint",
        # `sr` sets the spatial reference of the input point, the map extent
        # AND the returned geometries (identify has no outSR).
        sr: 4326,
        layers: "all:#{layer.identify_layers}",
        tolerance: tolerance || layer.identify_tolerance,
        mapExtent: [ lng - dlng, lat - dlat, lng + dlng, lat + dlat ].map { |v| v.round(7) }.join(","),
        imageDisplay: "#{IMAGE_SIZE},#{IMAGE_SIZE},96",
        returnGeometry: return_geometry
      }
    end

    def initialize(layers)
      @layers = layers.select(&:identifiable?)
    end

    def call(lng:, lat:, zoom:)
      zoom = zoom.to_f.round
      cached = @layers.index_with { |layer| Rails.cache.read(cache_key(layer, lng, lat, zoom)) }
      missing = @layers.reject { |layer| cached[layer] }
      fetched = fetch_in_parallel(missing, lng:, lat:, zoom:)

      @layers.map do |layer|
        raw = cached[layer] || fetched[layer]
        Rails.cache.write(cache_key(layer, lng, lat, zoom), raw, expires_in: CACHE_TTL) if fetched[layer]
        result_for(layer, raw)
      end
    end

    private
      def result_for(layer, raw)
        return Result.new(key: layer.key, name: layer.name, status: "unavailable", entries: []) if raw.nil?
        entries = Formatters.entries_for(layer.identify_formatter, raw)
        Result.new(key: layer.key, name: layer.name, status: entries.empty? ? "empty" : "ok", entries:)
      end

      # One thread per layer; the request thread waits at most DEADLINE
      # seconds overall. A layer that fails or times out maps to nil.
      def fetch_in_parallel(layers, lng:, lat:, zoom:)
        return {} if layers.empty?
        futures = layers.index_with do |layer|
          Concurrent::Promises.future do
            Rails.application.executor.wrap { self.class.request(layer, lng:, lat:, zoom:) }
          end
        end
        deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + DEADLINE
        ActiveSupport::Dependencies.interlock.permit_concurrent_loads do
          futures.transform_values do |future|
            remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
            value = future.value(remaining.positive? ? remaining : 0)
            log_failure(future) if future.rejected?
            future.fulfilled? ? value : nil
          end
        end
      end

      def log_failure(future)
        Rails.logger.warn("[identify] #{future.reason.class}: #{future.reason.message}")
      end

      def cache_key(layer, lng, lat, zoom)
        [ "map_data/identify", layer.id, layer.cache_version, lng.round(5), lat.round(5), zoom ].join("/")
      end
  end
end
