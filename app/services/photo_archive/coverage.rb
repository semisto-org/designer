module PhotoArchive
  # Which partial flights (options.partial: a summer flight over half of
  # Wallonia, the IGN's historical mosaics) do not cover a map's place:
  # a small image around the map's center that comes back all white or all
  # transparent means no photo there. Cached for a month per place; an
  # upstream error leaves the flight offered (better a blank photo than a
  # missing one).
  module Coverage
    BOX_M = 150
    SIZE = 32
    TTL = 30.days

    module_function

    # The keys of the photo layers (infrared twins included) without a
    # photo over this map.
    def uncovered(map)
      point = map.center or return []
      layers = PhotoArchive.layers(map.region)
      partial = layers.select(&:partial_coverage?)
      missing = partial.reject(&:infrared?).reject { |layer| covers?(layer, point) }.map(&:key)
      missing + layers.select { |layer| layer.infrared? && missing.include?(layer.option(:infrared_of)) }.map(&:key)
    end

    def covers?(layer, point)
      key = [ "photo-coverage", layer.key, layer.cache_version, point.x.round(3), point.y.round(3) ].join(":")
      Rails.cache.fetch(key, expires_in: TTL, skip_nil: true) { probe(layer, point) } != false
    end

    # true / false, or nil when the upstream did not answer.
    def probe(layer, point)
      x, y = PhotoArchive.mercator(point.x, point.y)
      image = Snapshot.new(layer, [ x - BOX_M, y - BOX_M, x + BOX_M, y + BOX_M ], width: SIZE, height: SIZE).image
      !blank?(image)
    rescue Providers::GeoHttp::Error, Vips::Error => error
      Rails.logger.info("[photo coverage] #{layer.key}: #{error.class}: #{error.message}")
      nil
    end

    def blank?(image)
      alpha = image.bands == 2 || image.bands == 4
      return true if alpha && image.extract_band(image.bands - 1).max.zero?

      colour = alpha ? image.extract_band(0, n: image.bands - 1) : image
      colour.min >= 250
    end
  end
end
