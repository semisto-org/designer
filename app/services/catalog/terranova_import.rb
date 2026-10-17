module Catalog
  # Imports the plant catalogue of Terranova (Semisto's internal app) into
  # the Designer catalogue: genera, species, varieties and French common names.
  #
  # Values only, never text: descriptions, notes, toxic elements and any
  # other free text stay out (they may quote PFAF or Wikipedia). Members,
  # contributors and comments are never read. Each imported value carries
  # the provenance « terranova », status « to_verify ».
  #
  # Only the species of the chosen baskets come in (TerranovaTriage; basket A
  # by default), most used first. A species the Designer did not know arrives
  # « proposed »: it joins the shared catalogue only once a reviewer accepted
  # it (CatalogueReviewsController), in that order.
  #
  # Upsert by `terranova_id`, else by latin name. A value the Designer already
  # holds from another source is kept, and listed as a conflict when
  # Terranova disagrees; a blank is filled (SpeciesWriter, keep_others).
  # Genera come from the species' names, never from Terranova's genus links,
  # some of which point at the wrong genus.
  #
  # Field mapping logic ported from Terranova (Plant::Knowledge: on a row
  # nobody assessed, a column default means « unknown », not a fact).
  class TerranovaImport
    SOURCE = "terranova".freeze

    # Terranova column defaults: on an unassessed row they mean « unknown ».
    UNASSESSED_DEFAULTS = {
      "plant_type" => %w[shrub tree], "soil_moisture" => %w[moist], "soil_richness" => %w[moderate],
      "fertility" => %w[self-fertile], "foliage_type" => %w[deciduous], "life_cycle" => %w[perennial],
      "root_system" => %w[fibrous], "growth_rate" => %w[medium], "watering_need" => %w[3]
    }.freeze

    COUNTRY_NAMES = {
      "belgique" => "BE", "belgium" => "BE", "france" => "FR", "allemagne" => "DE", "germany" => "DE",
      "pays bas" => "NL", "netherlands" => "NL", "luxembourg" => "LU", "royaume uni" => "GB",
      "united kingdom" => "GB", "suisse" => "CH", "italie" => "IT", "espagne" => "ES", "europe" => nil
    }.freeze

    SHORT_TEXT = 60

    Result = Struct.new(:genera, :species_created, :species_updated, :varieties, :skipped, :left_out, :conflicts, :errors, keyword_init: true) do
      def to_s
        "genera #{genera}, species #{species_created} created (to review) / #{species_updated} updated, " \
          "varieties #{varieties}, left out #{left_out.map { "#{_1} #{_2}" }.join(', ').presence || 0}, " \
          "skipped #{skipped}, conflicts #{conflicts.size}, errors #{errors.size}"
      end
    end

    attr_reader :provider, :baskets, :result

    def initialize(provider: Providers::Terranova.new, baskets: %w[A])
      @provider = provider
      @baskets = baskets
      @writer = SpeciesWriter.new(source: SOURCE, status: "to_verify", keep_others: true)
      @genera = {}
      @species = {}
      @result = Result.new(genera: 0, species_created: 0, species_updated: 0, varieties: 0, skipped: 0,
                           left_out: Hash.new(0), conflicts: [], errors: [])
    end

    def call
      raise Providers::Terranova::Unavailable, "TERRANOVA_API_TOKEN is not set" unless provider.configured?
      @genus_rows = provider.each_genus.to_a.index_by { _1["latin_name"].to_s.squish.downcase }
      TerranovaTriage.new(provider.each_species.to_a).entries.each do |entry|
        next result.left_out[entry.basket] += 1 unless baskets.include?(entry.basket)
        guard(entry.row) { import_species(entry) }
      end
      provider.each_variety { |row| guard(row) { import_variety(row) } }
      result
    end

    # Designer attributes of a Terranova species row (exposed for tests).
    def self.species_attributes(row)
      assessed = row["audited_at"].present? || row["height_max_cm"].present? ||
                 row["spread_max_cm"].present? || row["hardiness"].present?
      known = ->(field, value) { assessed || !Array(UNASSESSED_DEFAULTS[field]).include?(value.to_s) }
      single = ->(facet, field = facet.to_s) { known.(field, row[field]) ? PlantVocabulary.canonical(facet, row[field]) : nil }
      hardiness = row["hardiness"].to_s

      {
        "plant_type" => single.(:plant_type),
        "strata" => PlantVocabulary.canonical(:strata, row["strate"]),
        "foliage_type" => single.(:foliage_type),
        "life_cycle" => single.(:life_cycle),
        "growth_rate" => single.(:growth_rate),
        "root_system" => single.(:root_system),
        "fertility" => single.(:fertility),
        "soil_richness" => single.(:soil_richness),
        "height_min_m" => metres(row["height_min_cm"]),
        "height_max_m" => metres(row["height_max_cm"]),
        "spread_min_m" => metres(row["spread_min_cm"]),
        "spread_max_m" => metres(row["spread_max_cm"]),
        "hardiness_zone" => PlantVocabulary.canonical_zone(hardiness),
        "min_temperature_c" => PlantVocabulary.canonical_min_temperature(hardiness),
        "exposures" => PlantVocabulary.canonical_list(:exposures, row["exposures"]),
        "soil_moisture" => known.("soil_moisture", row["soil_moisture"]) ? PlantVocabulary.canonical_list(:soil_moisture, row["soil_moisture"]) : [],
        "soil_types" => PlantVocabulary.canonical_list(:soil_types, row["soil_types"]),
        "soil_ph" => PlantVocabulary.canonical_list(:soil_ph, row["soil_ph"]),
        "edible_parts" => PlantVocabulary.canonical_list(:edible_parts, row["edible_parts"]),
        "eco_services" => PlantVocabulary.canonical_list(:eco_services, row["eco_services_provided"]),
        "toxic_for" => PlantVocabulary.canonical_list(:toxic_for, toxic_keys(row["toxicity"])),
        "watering_need" => known.("watering_need", row["watering_need"]) ? rating(row["watering_need"]) : nil,
        "edible_rating" => rating(row["edible_rating"]),
        "medicinal_rating" => rating(row["medicinal_rating"]),
        "flowering_months" => PlantVocabulary.canonical_months(row["flowering_months"]),
        "fruiting_months" => PlantVocabulary.canonical_months(row["fruiting_months"]),
        "harvest_months" => PlantVocabulary.canonical_months(row["harvest_months"]),
        "pruning_months" => PlantVocabulary.canonical_months(row["pruning_months"]),
        "maturity_years" => years(row["maturity_years"]),
        "production_start_year" => years(row["production_start_year"]),
        "native_countries" => countries(row["native_countries"]) | (row["is_native_belgium"] == true ? [ "BE" ] : []),
        "invasive_countries" => row["is_invasive"] == true ? [ "BE" ] : []
      }
    end

    def self.variety_attributes(row)
      {
        "fertility" => PlantVocabulary.canonical(:fertility, row["fertility"]),
        "taste_rating" => rating(row["taste_rating"]),
        "productivity" => short(row["productivity"]),
        "ripening" => short(row["maturity"]),
        "disease_resistance" => short(row["disease_resistance"]),
        "maturity_years" => years(row["maturity_years"]),
        "production_start_year" => years(row["production_start_year"])
      }
    end

    def self.common_names(raw) = raw.to_s.split(/[,;]/).map(&:squish).reject(&:blank?)

    def self.metres(cm)
      value = Float(cm, exception: false)
      value && value.positive? && value < 20_000 ? (value / 100.0).round(2) : nil
    end

    def self.rating(raw)
      value = Integer(raw.to_s.strip, exception: false)
      value if value&.between?(1, 5)
    end

    def self.years(raw)
      value = Integer(raw.to_s.strip, exception: false)
      value if value&.between?(1, 199)
    end

    def self.short(raw)
      text = raw.to_s.squish
      text.presence && text.truncate(SHORT_TEXT, omission: "…")
    end

    # { "humans" => true, "dogs" => false } or ["humans"] → ["humans"].
    def self.toxic_keys(raw)
      case raw
      when Hash then raw.select { |_, v| v.present? && v != false && v.to_s != "false" }.keys
      else Array(raw)
      end
    end

    def self.countries(raw)
      values = raw.is_a?(String) ? raw.split(/[,;]/) : Array(raw)
      values.filter_map do |value|
        text = value.to_s.strip
        next text.upcase if text.match?(/\A[A-Za-z]{2}\z/)
        COUNTRY_NAMES[PlantVocabulary.normalize(text)]
      end.uniq
    end

    private
      def guard(row)
        yield
      rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
        result.errors << "#{row['latin_name'] || row['id']}: #{e.message}"
      end

      # The genus of a species' name, with Terranova's French name for it.
      def genus_for(latin)
        genus = PlantGenus.for_latin_name(latin) or return nil
        @genera[genus.id] ||= begin
          row = @genus_rows[genus.latin_name.downcase]
          if row
            genus.terranova_id ||= row["id"] unless PlantGenus.where.not(id: genus.id).exists?(terranova_id: row["id"])
            @writer.write(genus, { "common_name" => self.class.short(row["common_name"]) })
          end
          result.genera += 1
          genus
        end
      end

      def import_species(entry)
        row, latin = entry.row, entry.latin_name
        species = PlantSpecies.find_by(terranova_id: row["id"]) || PlantSpecies.find_by_latin_name(latin) ||
                  PlantSpecies.new(latin_name: latin, review_status: "proposed")
        return result.skipped += 1 if species.terranova_id.present? && species.terranova_id != row["id"]
        created = species.new_record?
        PlantSpecies.transaction do
          species.terranova_id = row["id"]
          species.genus ||= genus_for(latin)
          @writer.write(species, self.class.species_attributes(row), common_names: self.class.common_names(row["common_names_fr"]))
        end
        result.conflicts.concat(entry.conflicts.map { |field, ours, theirs| [ latin, field, ours, theirs ] })
        @species[row["id"]] = species
        created ? result.species_created += 1 : result.species_updated += 1
      end

      def import_variety(row)
        species = @species[row["species_id"]] || PlantSpecies.find_by(terranova_id: row["species_id"])
        name = variety_name(row["latin_name"], species)
        return result.skipped += 1 if species.nil? || name.blank?
        variety = PlantVariety.find_by(terranova_id: row["id"]) ||
                  species.varieties.where("lower(name) = ?", name.downcase).first ||
                  species.varieties.new(name:)
        variety.terranova_id ||= row["id"]
        @writer.write(variety, self.class.variety_attributes(row), common_names: self.class.common_names(row["common_names_fr"]))
        result.varieties += 1
      end

      # "Malus domestica 'Reinette'" → "Reinette".
      def variety_name(raw, species)
        name = raw.to_s.squish
        name = name.delete_prefix(species.latin_name).strip if species && name.downcase.start_with?(species.latin_name.downcase)
        name.delete_prefix("'").delete_suffix("'").delete_prefix("‘").delete_suffix("’").strip
      end
  end
end
