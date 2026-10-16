module Catalog
  # A person adds to a map's palette a species the catalogue lacks.
  #
  # The name is checked against GBIF first (`check`): a typo, an outdated name
  # or a species already in the catalogue under its accepted name is caught
  # before anything is created. The species then enters the catalogue as
  # « proposed »: only its author and the maps that use it see it until a
  # catalogue reviewer accepts it, merges it into another one or keeps it off
  # the shared catalogue (CatalogueReviewsController).
  #
  # What the person typed (common name, strata, size) is written with the
  # source « user » and the status « to_verify », like any value nobody has
  # checked against a reference yet.
  class SpeciesProposal
    SOURCE = "user".freeze
    DAILY_LIMIT = 30
    VALUES = %w[strata height_max_m spread_max_m].freeze

    class Refused < StandardError; end

    Result = Data.define(:species, :item, :created)

    def initialize(map:, user:, gbif: Providers::Gbif.build)
      @map = map
      @user = user
      @gbif = gbif
    end

    # { gbif: Match#as_json or { status: "unavailable" }, existing: [summary_json] }
    # `existing`: the species this person can already add under the typed
    # name, its accepted name or one of its latin synonyms.
    def check(name)
      name = name.to_s.squish
      match = gbif_match(name)
      names = [ name, match&.name, match&.suggested_name ].compact.uniq
      existing = names.filter_map { |n| find_existing(n) }.uniq.select { |s| s.visible_to?(@user) }
      { gbif: match ? match.as_json : { status: "unavailable" }, existing: existing.map(&:summary_json) }
    end

    # Creates the species (or reuses the one the catalogue already has under
    # that name) and adds it to the map's palette. Raises Refused.
    def create(latin_name:, common_name: nil, values: {})
      latin_name = self.class.botanical_case(latin_name)
      raise Refused, I18n.t("plants.proposal.errors.latin_name") unless latin_name.match?(/\A\p{Lu}\p{Ll}+( [×x])? [\p{Ll}×-]/)

      species = find_existing(latin_name)
      created = species.nil?
      if created
        raise Refused, I18n.t("plants.proposal.errors.daily_limit", count: daily_limit) if over_daily_limit?
        species = propose(latin_name, common_name, values)
      end
      item = add_to_palette(species)
      Result.new(species:, item:, created:)
    end

    # « salvia Nemorosa » → « Salvia nemorosa »: the genus capitalised, the
    # rest in lower case, as botanical names are written.
    def self.botanical_case(name)
      genus, *rest = name.to_s.squish.split(" ")
      [ genus.to_s.downcase.sub(/\A(\p{L})/) { $1.upcase }, *rest.map(&:downcase) ].join(" ")
    end

    private
      def gbif_match(name)
        @gbif.match(name)
      rescue Providers::Gbif::Unavailable
        nil
      end

      # Any species with this latin name or latin synonym, whatever its review
      # status: a second person proposing the same plant joins the first one.
      def find_existing(name)
        PlantSpecies.find_by_latin_name(name) || by_latin_synonym(name)
      end

      def by_latin_synonym(name)
        ids = PlantCommonName.where(nameable_type: "PlantSpecies", language: "la")
                             .where("lower(name) = ?", name.to_s.squish.downcase).limit(2).pluck(:nameable_id)
        ids.size == 1 ? PlantSpecies.find(ids.first) : nil
      end

      def daily_limit = DAILY_LIMIT

      def over_daily_limit?
        PlantSpecies.where(proposed_by: @user, created_at: 1.day.ago..).count >= daily_limit
      end

      def propose(latin_name, common_name, values)
        match = gbif_match(latin_name)
        recognised = match && match.name.to_s.casecmp?(latin_name.delete("×").squish) || match&.name == latin_name
        PlantSpecies.transaction do
          species = PlantSpecies.new(
            latin_name:, review_status: "proposed", proposed_by: @user, proposed_map: @map,
            gbif_key: recognised ? match.key : nil, family: recognised ? match.family : nil
          )
          species.genus = PlantGenus.for_latin_name(latin_name)
          writer.write(species, values.to_h.stringify_keys.slice(*VALUES).transform_values(&:presence).compact,
                       common_names: [ common_name.to_s.squish.presence ].compact)
          species
        end
      rescue ActiveRecord::RecordNotUnique
        find_existing(latin_name) || raise
      rescue ActiveRecord::RecordInvalid => error
        raise Refused, error.record.errors.full_messages.to_sentence
      end

      def add_to_palette(species)
        draft = @map.palette_drafts.find_by(species:, variety_id: nil)
        return draft.tap { |d| d.update!(status: "active") } if draft
        @map.palette_items.find_by(species:, variety_id: nil) ||
          @map.palette_items.create!(species:, created_by: @user)
      end

      def writer = @writer ||= SpeciesWriter.new(source: SOURCE, status: "to_verify")
  end
end
