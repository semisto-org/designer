# What a region's water authority publishes about its streams and basins,
# read through ArcGIS MapServers configured in the region's settings
# (`hydrography`, seeded for Wallonia: the SPW's RHW watercourses, the
# LIDAXES runoff axes, the PARIS sectors and the surface water bodies).
#
#   hydro = Providers::Hydrography.for(region)   # nil without settings
#   hydro.watercourses(bbox)   # => [Feature]  (lines, one per stretch)
#   hydro.runoff_axes(bbox, min_class: 3)
#   hydro.sub_basins(bbox)     # contributive basins of the sectors
#   hydro.sectors(ids)         # their watercourse and downstream landmark
#   hydro.water_bodies(bbox)
#
# Features come back as GeoJSON in WGS84 (`f=geojson`, generalised by the
# server to about a metre). Each query is cached a week: these layers change
# once per river basin management plan.
module Providers
  class Hydrography
    Feature = Data.define(:properties, :geometry)
    # The largest answer one query gives (the SPW's maxRecordCount).
    PAGE = 2000
    CACHE_TTL = 1.week
    TIMEOUT = 20
    # About a metre: the server simplifies lines and outlines before sending.
    OFFSET_DEGREES = 0.00001

    attr_reader :settings

    def self.for(region)
      settings = region&.setting(:hydrography)
      settings.is_a?(Hash) && settings.any? ? new(settings) : nil
    end

    def initialize(settings)
      @settings = settings
    end

    def attribution = settings["attribution"]
    def section(key) = settings[key].is_a?(Hash) ? settings[key] : nil

    def watercourses(bbox)
      config = section("watercourses") or return []
      fields = [ config["category_field"], *config["name_fields"], config["number_field"] ].compact.uniq
      Array(config["layers"]).flat_map do |layer|
        query("#{config['url'].to_s.chomp('/')}/#{layer}", bbox:, fields:)
      end
    end

    def runoff_axes(bbox, min_class:)
      config = section("runoff_axes") or return []
      field = config["class_field"]
      query(config["url"], bbox:, fields: [ field ], where: "#{field} >= #{min_class.to_i}")
    end

    def sub_basins(bbox)
      config = section("sub_basins") or return []
      query(config["url"], bbox:, fields: [ config["id_field"], config["water_body_field"], config["area_field"] ].compact)
    end

    # The sectors (lines) of these sub-basins, without their geometry: the
    # watercourse, the downstream landmark and the outlet's coordinates.
    def sectors(ids)
      config = section("sub_basins")
      return [] unless config && config["sectors_url"] && ids.any?
      fields = [ config["id_field"], config["watercourse_field"], config["outlet_field"], config["outlet_x"], config["outlet_y"] ].compact
      ids.each_slice(100).flat_map do |slice|
        where = "#{config['id_field']} IN (#{slice.map { |id| quote(id) }.join(', ')})"
        query(config["sectors_url"], fields:, where:, geometry: false)
      end
    end

    def water_bodies(bbox)
      config = section("water_bodies") or return []
      query(config["url"], bbox:, fields: [ config["id_field"], config["name_field"], config["area_field"], config["sheet_field"] ].compact)
    end

    private
      def query(url, fields:, bbox: nil, where: "1=1", geometry: true)
        params = {
          where:, outFields: fields.join(","), returnGeometry: geometry, outSR: 4326, f: geometry ? "geojson" : "json",
          resultRecordCount: PAGE
        }
        if bbox
          params.merge!(geometry: bbox.map { |v| v.round(6) }.join(","), geometryType: "esriGeometryEnvelope", inSR: 4326,
                        spatialRel: "esriSpatialRelIntersects")
        end
        params.merge!(geometryPrecision: 6, maxAllowableOffset: OFFSET_DEGREES) if geometry
        key = [ "hydrography", Digest::SHA1.hexdigest([ url, params.sort ].to_json) ].join("/")
        rows = Rails.cache.fetch(key, expires_in: CACHE_TTL) do
          data = GeoHttp.get_json("#{url.to_s.chomp('/')}/query", params:, timeout: TIMEOUT)
          raise GeoHttp::Unavailable, data["error"].to_json if data.is_a?(Hash) && data["error"]
          Array(data.is_a?(Hash) ? data["features"] : nil).map do |feature|
            { "properties" => feature["properties"] || feature["attributes"] || {}, "geometry" => feature["geometry"] }
          end
        end
        rows.map { |row| Feature.new(properties: row["properties"], geometry: geometry ? row["geometry"] : nil) }
      end

      def quote(value) = "'#{value.to_s.gsub("'", "''")}'"
  end
end
