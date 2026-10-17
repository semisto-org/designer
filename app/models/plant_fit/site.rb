class PlantFit
  # What a map tells about its growing conditions, read from what the app
  # already holds: the climate zone, the exposures of its planting patches,
  # its soil analyses and the constraints written in its project sheet. Each
  # signal remembers where it comes from, so the person can see why.
  #
  # Known facts rule a species out (`excluded_by`): less hardy than the
  # zone, invasive in the country, toxic for the animals of the project.
  # Everything else becomes a criterion of PlantFit, judged or unknown.
  class Site
    # Project sheet livestock → PlantVocabulary toxic_for keys.
    LIVESTOCK_TOXICITY = {
      "chickens" => "poultry", "ducks_geese" => "poultry", "sheep" => "sheep", "goats" => "sheep",
      "donkeys_horses" => "horses", "cattle" => "cattle"
    }.freeze
    SHEET_SOIL_TYPES = { "clay" => "clay", "sandy" => "sandy", "stony" => "stony", "calcareous" => "chalky" }.freeze
    # Texture class of a soil analysis (SoilAnalysis::TextureClass) → soil type.
    TEXTURE_SOIL_TYPES = {
      "sand" => "sandy", "loamy_sand" => "sandy", "sandy_loam" => "sandy",
      "loam" => "loam", "silt_loam" => "loam", "silt" => "loam",
      "sandy_clay_loam" => "clay", "clay_loam" => "clay", "silty_clay_loam" => "clay",
      "sandy_clay" => "clay", "silty_clay" => "clay", "clay" => "clay"
    }.freeze
    ACID_BELOW = 6.0
    ALKALINE_ABOVE = 7.5
    PH_ORDER = %w[acidic neutral alkaline].freeze

    Signal = Data.define(:values, :origin) do
      def as_json(*) = { values:, origin: }
    end

    attr_reader :map

    def initialize(map)
      @map = map
    end

    def zone = map.hardiness_zone
    def country = map.country_code

    def signals
      @signals ||= {
        "hardiness" => (Signal.new(values: [ zone ], origin: "climate") if zone),
        "exposure" => exposure_signal,
        "moisture" => moisture_signal,
        "soil_type" => soil_type_signal,
        "ph" => ph_signal
      }.compact
    end

    # Toxicity keys of the animals the project keeps.
    def toxic_for
      @toxic_for ||= Array(sheet_section("livestock")["species"]).filter_map { |s| LIVESTOCK_TOXICITY[s] }.uniq
    end

    # Why a known fact rules the species out, or nil.
    def excluded_by(species)
      return "hardiness" if zone && species.hardiness_zone && species.hardiness_zone > zone
      return "invasive" if species.invasive_in?(country)
      return "toxic" if (species.toxic_for & toxic_for).any?
      nil
    end

    def fit(species) = PlantFit.new(species, signals.map { |key, signal| criterion(key, signal, species) })

    def as_json(*) = { signals: signals.transform_values(&:as_json), toxicFor: toxic_for, country: }

    private
      def criterion(key, signal, species)
        field, status = case key
        when "hardiness" then [ "hardiness_zone", hardiness(species) ]
        when "exposure" then [ "exposures", among(species.exposures, signal.values) ]
        when "moisture" then [ "soil_moisture", moisture(species.soil_moisture, signal.values) ]
        when "soil_type" then [ "soil_types", soil_type(species.soil_types, signal.values) ]
        when "ph" then [ "soil_ph", ph(species.soil_ph, signal.values) ]
        end
        Criterion.new(key:, status:, field:, site: signal.values, verified: species.provenance_status(field) == "sourced")
      end

      def hardiness(species)
        return "unknown" unless species.hardiness_zone
        species.hardiness_zone <= zone ? "fits" : "misfit"
      end

      def among(known, site) = known.empty? ? "unknown" : ((known & site).any? ? "fits" : "misfit")

      # The site may be wet in one corner and dry in another: the best match
      # over what it offers.
      def moisture(known, site)
        return "unknown" if known.empty?
        best(site.map do |value|
          wanted = value == "wet" ? %w[wet waterlogged] : %w[dry]
          (known & wanted).any? ? "fits" : (known.include?("moist") ? "partial" : "misfit")
        end)
      end

      # Soil type lists rarely name every soil a plant tolerates: a soil not
      # listed is a doubt, not a refusal.
      def soil_type(known, site) = known.empty? ? "unknown" : ((known & site).any? ? "fits" : "partial")

      def ph(known, site)
        return "unknown" if known.empty?
        best(site.map do |value|
          next "fits" if known.include?(value)
          distance = known.map { |k| (PH_ORDER.index(k).to_i - PH_ORDER.index(value).to_i).abs }.min
          distance == 1 ? "partial" : "misfit"
        end)
      end

      def best(statuses) = statuses.min_by { |s| %w[fits partial misfit].index(s) }

      def sheet_section(name) = map.project_sheet.section(name)
      def sheet_soil = Array(sheet_section("constraints")["soil"])

      def exposure_signal
        values = map.features.active.where(kind: PlantableFeature::PATCH).filter_map { |f| f.properties["exposure"].presence }.uniq
        values = PlantVocabulary.keys(:exposures) & values
        Signal.new(values:, origin: "patches") if values.any?
      end

      def moisture_signal
        values = sheet_soil.filter_map { |s| { "wet" => "wet", "dry" => "dry" }[s] }
        values << "wet" if Array(sheet_section("constraints")["water"]).include?("flooding")
        Signal.new(values: values.uniq, origin: "sheet") if values.any?
      end

      def soil_type_signal
        textures = analysed_samples.filter_map do |sample|
          r = sample.results
          SoilAnalysis::TextureClass.classify(sand: r["sand_pct"], silt: r["silt_pct"], clay: r["clay_pct"])
        end.filter_map { |texture| TEXTURE_SOIL_TYPES[texture] }.uniq
        return Signal.new(values: textures, origin: "soil_samples") if textures.any?
        values = sheet_soil.filter_map { |s| SHEET_SOIL_TYPES[s] }.uniq
        Signal.new(values:, origin: "sheet") if values.any?
      end

      def ph_signal
        readings = analysed_samples.filter_map { |sample| sample.results["ph_water"]&.to_f }
        if readings.any?
          median = readings.sort[readings.size / 2]
          value = median < ACID_BELOW ? "acidic" : (median > ALKALINE_ABOVE ? "alkaline" : "neutral")
          return Signal.new(values: [ value ], origin: "soil_samples")
        end
        values = sheet_soil.filter_map { |s| { "acidic" => "acidic", "calcareous" => "alkaline" }[s] }.uniq
        Signal.new(values:, origin: "sheet") if values.any?
      end

      def analysed_samples = @analysed_samples ||= map.soil_samples.select { |s| s.results.present? }
  end
end
