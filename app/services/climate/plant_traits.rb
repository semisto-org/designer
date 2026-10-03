module Climate
  # The climate-related traits of a plant species, read defensively from
  # whatever the catalogue model exposes (the catalogue is another feature
  # area and its fields may evolve):
  #
  #   min_temperature_c  lowest temperature the plant tolerates
  #   hardiness_zone     USDA zone it is hardy to (cold limit)
  #   max_zone           warmest USDA zone it is comfortable in (heat limit)
  #   drought            :tolerant, :sensitive or nil (unknown)
  #
  # Legacy hardiness text ("zone-5", "-15°C", "-25/-30°C (USDA 4)") is
  # understood the way the Terranova catalogue normalised it.
  class PlantTraits
    TEMPERATURE = /-\s*(\d{1,2}(?:[.,]\d)?)\s*°?\s*c\b/i
    ZONE_HINT = /zone|usda|\A\s*\d{1,2}\s*[ab]?\s*\z/i

    attr_reader :min_temperature_c, :hardiness_zone, :max_zone, :drought

    def self.from(species)
      return new unless species
      min_c = number(read(species, :min_temperature_c, :min_temp_c, :hardiness_min_c))
      zone = HardinessZone.parse(read(species, :hardiness_zone, :usda_zone))
      raw = read(species, :hardiness)
      if raw.present? && min_c.nil? && zone.nil?
        if (match = raw.to_s.scan(TEMPERATURE).flatten.map { -_1.tr(",", ".").to_f }.min)
          min_c = match
        elsif raw.to_s.match?(ZONE_HINT)
          zone = HardinessZone.parse(raw)
        end
      end
      new(
        min_temperature_c: min_c,
        hardiness_zone: zone,
        max_zone: HardinessZone.parse(read(species, :max_hardiness_zone, :hardiness_zone_max, :max_usda_zone)),
        drought: drought_of(species)
      )
    end

    def initialize(min_temperature_c: nil, hardiness_zone: nil, max_zone: nil, drought: nil)
      @min_temperature_c = min_temperature_c
      @hardiness_zone = hardiness_zone
      @max_zone = max_zone
      @drought = drought
    end

    # The coldest temperature the plant is expected to survive.
    def cold_limit_c = min_temperature_c || hardiness_zone&.min_c

    def known? = !cold_limit_c.nil? || !max_zone.nil? || !drought.nil?

    class << self
      private
        def read(object, *attributes)
          attributes.each do |attribute|
            value = object.public_send(attribute) if object.respond_to?(attribute)
            return value if value.present? || value == false
          end
          nil
        end

        def number(value)
          value.is_a?(Numeric) ? value.to_f : Float(value.to_s.tr(",", "."), exception: false)
        end

        DRY_SOILS = %w[dry sec].freeze
        WET_SOILS = %w[wet waterlogged humide aquatic].freeze

        # Explicit drought fields first, then a watering need on a 1-5
        # scale, then the soil moisture the plant accepts (a single value or
        # a list of vocabulary keys): accepting dry soil means tolerant,
        # accepting only wet soils means sensitive.
        def drought_of(species)
          flag = read(species, :drought_tolerant?, :drought_tolerant)
          return flag ? :tolerant : :sensitive if flag == true || flag == false

          case read(species, :drought_tolerance).to_s.downcase
          when "high", "good", "tolerant", "forte", "bonne", "4", "5" then return :tolerant
          when "low", "none", "sensitive", "faible", "nulle", "1", "2" then return :sensitive
          end

          case number(read(species, :watering_need, :water_need))&.round
          when 1 then return :tolerant
          when 4, 5 then return :sensitive
          end

          moisture = Array(read(species, :soil_moisture)).map { _1.to_s.downcase }.reject(&:empty?)
          return :tolerant if moisture.intersect?(DRY_SOILS)
          :sensitive if moisture.any? && moisture.all? { WET_SOILS.include?(_1) }
        end
    end
  end
end
