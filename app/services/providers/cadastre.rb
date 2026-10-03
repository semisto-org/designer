# Cadastral parcels of a region, through the region layer whose
# `options.role` is "cadastre" (Wallonia: the SPW CADMAP_PARCELLES identify).
#
#   cadastre = Providers::Cadastre.for(region)   # nil when the region has none
#   cadastre.parcel_at(lng, lat)                 # => Parcel or nil
#
# Parcels are cached by CAPAKEY, so validating a selection does not ask the
# upstream again; on a cache miss we identify again at the clicked point
# and check the CAPAKEY still matches (never trust a client geometry).
module Providers
  class Cadastre
    Parcel = Data.define(:capakey, :label, :detail, :geometry, :lng, :lat) do
      def as_json(*) = { capakey:, label:, detail:, geometry:, lng:, lat: }
    end

    CACHE_TTL = 1.day
    # Zoom used to size the identify extent: a parcel click needs no
    # tolerance, the point must fall inside the polygon.
    ZOOM = 18

    def self.for(region)
      layer = region.layers.enabled.detect { |l| l.role == "cadastre" && l.identifiable? }
      layer && new(layer)
    end

    attr_reader :layer

    def initialize(layer)
      @layer = layer
    end

    # Raises GeoHttp::Unavailable when the upstream cannot answer.
    def parcel_at(lng, lat)
      results = ArcgisIdentify.request(@layer, lng:, lat:, zoom: ZOOM, return_geometry: true, tolerance: 0)
      result = results.find { |r| r.is_a?(Hash) && r.dig("attributes", "CAPAKEY").present? && r["geometry"].is_a?(Hash) }
      return nil unless result

      parcel = build(result, lng, lat)
      return nil unless parcel
      Rails.cache.write(cache_key(parcel.capakey), parcel.as_json.deep_stringify_keys, expires_in: CACHE_TTL)
      parcel
    end

    # The parcel `capakey`, from the cache or identified again at lng/lat.
    def parcel(capakey, lng:, lat:)
      if (cached = Rails.cache.read(cache_key(capakey)))
        return Parcel.new(**cached.symbolize_keys)
      end
      found = parcel_at(lng, lat)
      found if found&.capakey == capakey
    end

    private
      def build(result, lng, lat)
        attributes = result["attributes"]
        entry = ArcgisIdentify::Formatters.cadastre_entry(attributes)
        Parcel.new(
          capakey: attributes["CAPAKEY"].to_s.strip,
          label: ArcgisIdentify::Formatters.clean(entry[:text]),
          detail: ArcgisIdentify::Formatters.clean(entry[:detail]).presence,
          geometry: EsriGeometry.to_geojson(result["geometry"]),
          lng: lng.to_f, lat: lat.to_f
        )
      rescue EsriGeometry::Invalid
        nil
      end

      def cache_key(capakey)
        [ "map_data/parcel", @layer.region_id, @layer.cache_version, capakey ].join("/")
      end
  end
end
