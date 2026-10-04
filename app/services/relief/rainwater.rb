module Relief
  # Rainwater that the map's roofs can collect in a year: roof area (the
  # footprints of buildings, greenhouses, shelters and sheds) × annual rainfall × a
  # runoff coefficient (losses to evaporation, first flush, overflow).
  # An order of magnitude to size a tank, not a measurement.
  class Rainwater
    ROOF_KINDS = %w[building greenhouse shelter shed].freeze

    def initialize(map, settings: map.effective_water_settings)
      @map = map
      @settings = settings
    end

    def call
      area, count = roof_area_and_count
      rainfall = @settings["annual_rainfall_mm"]&.to_f
      coefficient = @settings["roof_coefficient"].to_f
      {
        roofAreaM2: area.round(1),
        buildings: count,
        annualRainfallMm: rainfall,
        coefficient:,
        volumeM3: rainfall ? self.class.volume_m3(area, rainfall, coefficient).round(1) : nil
      }
    end

    def self.volume_m3(roof_area_m2, rainfall_mm, coefficient)
      roof_area_m2 * rainfall_mm / 1000.0 * coefficient
    end

    private
      def roof_area_and_count
        row = @map.features.active.where(kind: ROOF_KINDS)
          .where("ST_GeometryType(geometry) IN ('ST_Polygon', 'ST_MultiPolygon')")
          .pick(Arel.sql("COALESCE(SUM(ST_Area(geometry::geography)), 0)"), Arel.sql("COUNT(*)"))
        [ row[0].to_f, row[1].to_i ]
      end
  end
end
