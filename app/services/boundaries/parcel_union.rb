# "Choisir mes parcelles" → "Valider": the selected cadastral parcels
# become the terrain outline (their union) and their CAPAKEYs are kept in
# maps.parcels. Geometries come from the cadastre provider (cache or a new
# identify at the clicked point), never from the client.
module Boundaries
  class ParcelUnion
    class Error < StandardError; end

    MAX_PARCELS = 60

    # parcels: [{ capakey:, lng:, lat: }]
    def initialize(map, parcels, cadastre: Providers::Cadastre.for(map.region))
      @map = map
      @parcels = Array(parcels)
      @cadastre = cadastre
    end

    def call
      raise Error, I18n.t("map_data.parcels.errors.unavailable") unless @cadastre
      raise Error, I18n.t("map_data.parcels.errors.none") if @parcels.empty?
      raise Error, I18n.t("map_data.parcels.errors.too_many", count: MAX_PARCELS) if @parcels.size > MAX_PARCELS

      found = @parcels.uniq { |p| p[:capakey] }.map { |p| resolve(p) }
      geometry = GeometryUnion.call(found.map(&:geometry))
      @map.update!(boundary: geometry, parcels: found.map(&:capakey))
      @map
    rescue GeometryUnion::Empty
      raise Error, I18n.t("map_data.parcels.errors.geometry")
    rescue Providers::GeoHttp::Error
      raise Error, I18n.t("map_data.parcels.errors.unreachable")
    end

    private
      def resolve(entry)
        capakey = entry[:capakey].to_s.strip
        lng, lat = Float(entry[:lng]), Float(entry[:lat])
        @cadastre.parcel(capakey, lng:, lat:) || raise(Error, I18n.t("map_data.parcels.errors.not_found", capakey:))
      rescue ArgumentError, TypeError
        raise Error, I18n.t("map_data.parcels.errors.none")
      end
  end
end
