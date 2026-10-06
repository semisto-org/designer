module Mcp
  # Turns a list of plants an AI read somewhere (a spreadsheet, a PDF, an
  # export of another tool) into palette drafts: each line is matched to the
  # catalogue (by id, else by exact latin or common name, else by a search
  # with a single answer) and waits, with its rationale, for a human.
  class PaletteProposal
    MAX_PLANTS = 200
    MAX_PENDING = 500

    Outcome = Data.define(:created, :rejected)

    def initialize(map:, user:)
      @map = map
      @user = user
    end

    def call(lines)
      raise ToolError, I18n.t("mcp.errors.too_many_plants", max: MAX_PLANTS) if lines.size > MAX_PLANTS
      pending = @map.palette_drafts.count
      taken = PaletteItem.where(map: @map).pluck(:species_id, :variety_id).to_set
      created = []
      rejected = []
      lines.each_with_index do |line, index|
        line = line.to_h.transform_keys(&:to_s)
        species, error = resolve(line)
        variety = species && line["variety_id"] && species.varieties.find_by(id: line["variety_id"])
        error ||= I18n.t("mcp.palette_errors.variety", id: line["variety_id"]) if species && line["variety_id"] && !variety
        error ||= I18n.t("mcp.palette_errors.taken", name: species.common_name || species.latin_name) if species && taken.include?([ species.id, variety&.id ])
        error ||= I18n.t("mcp.palette_errors.pending", max: MAX_PENDING) if pending >= MAX_PENDING
        if error
          rejected << { index:, name: line["name"], error: }
          next
        end
        item = @map.palette_drafts.new(
          species:, variety:, strata: line["strata"], role: line["role"], target_count: line["target_count"],
          notes: line["notes"], rationale: line["rationale"], source: "ai", created_by: @user
        )
        if item.save
          taken << [ species.id, variety&.id ]
          pending += 1
          created << { index:, item: }
        else
          rejected << { index:, name: line["name"], error: item.errors.full_messages.to_sentence }
        end
      end
      @map.touch if created.any?
      Outcome.new(created:, rejected:)
    end

    private
      # [species, nil] or [nil, error message].
      def resolve(line)
        if line["species_id"]
          species = PlantSpecies.find_by(id: line["species_id"])
          return species ? [ species, nil ] : [ nil, I18n.t("mcp.palette_errors.species_id", id: line["species_id"]) ]
        end
        name = line["name"].to_s.squish
        return [ nil, I18n.t("mcp.palette_errors.no_name") ] if name.blank?
        exact = PlantSpecies.find_by_latin_name(name) || by_common_name(name)
        return [ exact, nil ] if exact
        found = PlantSpecies.matching(name).limit(2).to_a
        return [ found.first, nil ] if found.size == 1
        [ nil, I18n.t(found.empty? ? "mcp.palette_errors.unknown" : "mcp.palette_errors.ambiguous", name:) ]
      end

      def by_common_name(name)
        ids = PlantCommonName.where(nameable_type: "PlantSpecies").where("lower(unaccent(name)) = lower(unaccent(?))", name).distinct.pluck(:nameable_id)
        ids.size == 1 ? PlantSpecies.find(ids.first) : nil
      end
  end
end
