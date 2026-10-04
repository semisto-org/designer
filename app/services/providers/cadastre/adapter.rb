module Providers
  class Cadastre
    # Shared behaviour of the cadastre providers that are not an ArcGIS
    # identify layer: same `parcel_at` / `parcel` interface and cache as
    # Providers::Cadastre. Subclasses implement `find(lng, lat)` → Parcel.
    class Adapter
      attr_reader :region, :config

      def initialize(region, config)
        @region = region
        @config = config.to_h.deep_stringify_keys
      end

      # Raises GeoHttp::Unavailable when the upstream cannot answer.
      def parcel_at(lng, lat)
        parcel = find(lng.to_f, lat.to_f)
        return nil unless parcel

        Rails.cache.write(cache_key(parcel.capakey), parcel.as_json.deep_stringify_keys, expires_in: CACHE_TTL)
        parcel
      end

      def parcel(capakey, lng:, lat:)
        if (cached = Rails.cache.read(cache_key(capakey)))
          return Parcel.new(**cached.symbolize_keys)
        end
        found = parcel_at(lng, lat)
        found if found&.capakey == capakey
      end

      private
        def url = config.fetch("url")

        def cache_key(capakey)
          [ "map_data/parcel", region.id, config["provider"], region.updated_at.to_i, capakey ].join("/")
        end

        def square_meters(value)
          number = value.to_f
          return nil unless number.positive?
          "#{ActiveSupport::NumberHelper.number_to_delimited(number.round, delimiter: " ")} m²"
        end

        # The first polygon feature that contains the point, else the first.
        def containing(features, lng, lat)
          point = GeoJsonGeometry::FACTORY.point(lng, lat)
          features.find do |feature|
            geometry = RGeo::GeoJSON.decode(feature["geometry"].to_json, geo_factory: GeoJsonGeometry::FACTORY)
            geometry&.contains?(point)
          rescue RGeo::Error::RGeoError
            false
          end || features.first
        end
    end
  end
end
