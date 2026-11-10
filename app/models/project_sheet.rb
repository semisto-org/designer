# The "fiche projet" of a map: who is designing, what they want, with which
# means. A guided, multi-session form (also read by Claude through the MCP
# later), stored in `maps.project` (jsonb) as
#
#   { "who" => { "people" => [ { "name" => "Marie", "role" => "lead" } ], … },
#     "budget" => { "initial" => "up_to_2000", … },
#     "meta" => { "done" => [ "who" ], "touched" => { "who" => "2026-10-04T…" } } }
#
# Every key is declared below (typed, enums closed). Nothing else is stored.
# `ProjectSheet.parse(raw)` validates input (strict) or reads stored data
# (lenient); `ProjectSheet.merge` applies a patch at field level, so a phone
# and a laptop editing different sections never overwrite each other.
class ProjectSheet
  NOTES = TypedSchema.text("notes")

  # Entries of the functional analysis (section "analysis").
  NEED = [ TypedSchema.text("name", limit: 160, required: true), TypedSchema.boolean("essential") ].freeze
  FUNCTION = [ TypedSchema.text("name", limit: 120, required: true), TypedSchema.text("id", limit: 40, hidden: true) ].freeze
  FACTOR = [ TypedSchema.text("name", limit: 160, required: true), TypedSchema.enum("origin", *%w[people place surroundings], counts: false) ].freeze
  # The lists of functions, and who they belong to.
  FUNCTION_LISTS = { "holder_functions" => "holder", "place_functions" => "place" }.freeze

  # Food families for the taste palette: what each person loves or avoids,
  # and what the designer keeps for the plant palette.
  FOOD_FAMILIES = %w[apples pears plums cherries peaches_apricots figs grapes kiwis persimmons quinces_medlars berries
    unusual_fruits nuts herbs perennial_vegetables edible_flowers mushrooms].freeze

  # What the palette keeps out (who.keep_away). "stings" is not a toxicity:
  # it leaves the melliferous need out of the suggestions.
  KEEP_AWAY = %w[toxic_humans toxic_dogs toxic_cats stings].freeze

  SECTIONS = {
    # Qui : une ou plusieurs personnes.
    "who" => [
      TypedSchema.list("people", [
        TypedSchema.text("name", limit: 80, required: true),
        TypedSchema.enum("role", *%w[lead partner family friend collective employee other]),
        TypedSchema.text("note", limit: 200),
        TypedSchema.text("phone", limit: 40, personal: true),
        TypedSchema.text("email", limit: 120, personal: true)
      ], max: 12),
      TypedSchema.enum("profile", *%w[individual collective school business farm commune other]),
      TypedSchema.enum("experience", *%w[beginner some experienced professional]),
      # Only what changes the garden (plants or insects to avoid, a way of
      # moving about): never a diagnosis. Health data, so personal.
      TypedSchema.text("care", limit: 500, personal: true),
      # What the plant palette must rule out, without saying why: plants
      # toxic for people (children, visitors) or for the household's pets,
      # and fewer melliferous plants near where people live (stings). Read
      # by PlantFit::Site, PaletteSuggestions and the AI; never a diagnosis,
      # so not personal (the reason stays in `care`).
      TypedSchema.multi("keep_away", *KEEP_AWAY, counts: false),
      NOTES
    ],
    # Ambitions et objectifs.
    "ambitions" => [
      TypedSchema.multi("goals", *%w[food_autonomy biodiversity income education hospitality landscape climate_resilience soil_water wood_energy wellbeing]),
      TypedSchema.enum("main_goal", *%w[food_autonomy biodiversity income education hospitality landscape climate_resilience soil_water wood_energy wellbeing]),
      # The why, in the person's words: it feeds the purpose of the analysis.
      TypedSchema.text("meaning", limit: 1_000),
      NOTES,
      # Not needed, but a joy: a wished need, not an essential one.
      TypedSchema.text("bonus", limit: 500),
      TypedSchema.text("inspirations", limit: 1_000)
    ],
    # Usages souhaités.
    "uses" => [
      TypedSchema.multi("uses", *%w[eat_fresh preserve forage_walk children_play relax gatherings work_outdoors teaching guests market_sales animals_care wood_craft medicinal wildlife_watch]),
      TypedSchema.enum("presence", *%w[daily several_per_week weekends holidays remote]),
      # What the garden could give beyond food: guides the plant palette.
      TypedSchema.multi("products", *%w[herbal_teas medicinal balms_hydrosols mushrooms basketry dyes firewood cut_flowers honey_plants fodder], counts: false),
      NOTES
    ],
    # Le lieu vu par les personnes qui y vivent : ce qui s'y passe déjà, ce
    # qu'elles seules savent (eau, gel, vent), ce à quoi elles tiennent, son
    # histoire. Ce que la personne a vu dehors pèse plus que les modèles.
    "place" => [
      TypedSchema.text("ongoing", limit: 1_000, counts: true),
      TypedSchema.text("knowledge", limit: 2_000, counts: true),
      TypedSchema.text("keep", limit: 1_000, counts: true),
      TypedSchema.text("history", limit: 1_000)
    ],
    # Palette gustative : ce que chacun aime manger, la façon de cuisiner et
    # de conserver. Chaque personne du projet remplit sa ligne depuis le lien
    # privé ; la lecture du designer reste à l'équipe.
    "taste" => [
      TypedSchema.list("tasters", [
        TypedSchema.text("name", limit: 80, required: true),
        TypedSchema.multi("loves", *FOOD_FAMILIES, tone: :positive),
        TypedSchema.multi("dislikes", *FOOD_FAMILIES, tone: :negative),
        TypedSchema.text("favorites", limit: 200),
        TypedSchema.text("allergies", limit: 200, personal: true)
      ], max: 12),
      TypedSchema.multi("flavors", *%w[sweet tangy bitter aromatic nutty spicy]),
      TypedSchema.multi("kitchen", *%w[fresh cooking jams juice_cider drying fermenting syrups_liqueurs herbal_teas]),
      TypedSchema.enum("curiosity", *%w[familiar some_new adventurous]),
      TypedSchema.enum("harvest_spread", *%w[all_year big_harvests no_preference]),
      NOTES,
      TypedSchema.multi("priorities", *FOOD_FAMILIES, counts: false, team_only: true),
      TypedSchema.text("designer_notes", team_only: true)
    ],
    # Budget, par tranches.
    "budget" => [
      TypedSchema.enum("initial", *%w[under_500 up_to_2000 up_to_5000 up_to_15000 over_15000 unknown]),
      TypedSchema.enum("yearly", *%w[under_100 up_to_500 up_to_1500 over_1500 unknown]),
      TypedSchema.multi("spend_priorities", *%w[quality_plants implementation co_management design tools fencing earthworks_water]),
      TypedSchema.multi("funding", *%w[self subsidy loan crowdfunding], counts: false),
      NOTES
    ],
    # Temps disponible.
    "time" => [
      TypedSchema.integer("hours_per_week", 0..80),
      TypedSchema.multi("seasons", *%w[spring summer autumn winter]),
      TypedSchema.multi("help", *%w[alone household friends volunteers paid_help], counts: false),
      NOTES
    ],
    # Compétences.
    "skills" => [
      TypedSchema.multi("skills", *%w[none gardening pruning grafting propagation carpentry masonry machinery earthworks animal_care botany irrigation beekeeping preserving], exclusive: "none"),
      TypedSchema.multi("to_learn", *%w[gardening pruning grafting propagation carpentry masonry machinery earthworks animal_care botany irrigation beekeeping preserving], counts: false),
      NOTES
    ],
    # Contraintes : sol, eau, voisinage, réglementation, accès, pente.
    "constraints" => [
      TypedSchema.multi("soil", *%w[clay sandy stony compacted wet dry acidic calcareous shallow unknown], exclusive: "unknown"),
      TypedSchema.multi("water", *%w[tap_only well pond_stream rain_tank no_water flooding unknown], exclusive: "unknown"),
      TypedSchema.multi("neighborhood", *%w[none close_neighbors spray_drift road_noise shade_casters wind unknown], exclusive: %w[none unknown]),
      TypedSchema.multi("regulation", *%w[none heritage natura2000 flood_zone forest_code hedge_permit tenant_limits unknown], exclusive: %w[none unknown]),
      TypedSchema.multi("access", *%w[vehicle_ok narrow no_vehicle steep_path far_from_home unknown], exclusive: "unknown"),
      TypedSchema.enum("slope", *%w[flat gentle moderate steep unknown]),
      NOTES
    ],
    # Opportunités.
    "opportunities" => [
      TypedSchema.multi("items", *%w[sunny_south existing_trees existing_hedge pond_stream buildings mulch_source local_nursery neighbors_help subsidies community visibility]),
      NOTES
    ],
    # Élevages envisagés.
    "livestock" => [
      TypedSchema.multi("species", *%w[none chickens ducks_geese sheep goats pigs donkeys_horses cattle rabbits bees other], exclusive: "none"),
      NOTES
    ],
    # Calendrier : quand planter.
    "calendar" => [
      TypedSchema.multi("planting_seasons", *%w[autumn winter spring]),
      TypedSchema.integer("start_year", 2020..2060),
      TypedSchema.enum("phasing", *%w[one_go two_three_years as_budget_allows]),
      NOTES,
      # The last word of the sheet, before « J'ai terminé ».
      TypedSchema.text("anything_else", limit: 2_000)
    ],
    # Analyse fonctionnelle (Semisto's design method, app/design_guides/method.md):
    # the purpose, then the needs and the functions of the people behind the
    # project and of the place itself, then the challenges and the assets,
    # each said to come from the people, the place or its surroundings. A
    # need can be essential (not negotiable) or wished. Each function has a
    # stable id that elements of the map point to (`properties.serves`), so
    # the « Fonctions » panel says which ones no element, or only one, serves.
    # The designers' work, not the client's: never on the private link.
    "analysis" => [
      TypedSchema.text("purpose", limit: 500, team_only: true),
      TypedSchema.list("holder_needs", NEED, max: 20, team_only: true),
      TypedSchema.list("holder_functions", FUNCTION, max: 20, team_only: true),
      TypedSchema.list("place_needs", NEED, max: 20, team_only: true),
      TypedSchema.list("place_functions", FUNCTION, max: 20, team_only: true),
      TypedSchema.list("challenges", FACTOR, max: 30, team_only: true),
      TypedSchema.list("assets", FACTOR, max: 30, team_only: true),
      TypedSchema.text("notes", team_only: true)
    ]
  }.each_value(&:freeze).freeze

  META_FIELDS = [ TypedSchema.multi("done", *SECTIONS.keys) ].freeze

  attr_reader :values, :errors, :meta

  # raw: a Hash, ActionController::Parameters, nil (an empty sheet).
  # strict: record an error for every invalid value (input) instead of
  # silently dropping it (reading stored data).
  # holder: read as the people behind the project (private link): the
  # team-only fields are not part of the sheet, so they are neither read
  # nor written.
  def self.parse(raw, strict: true, holder: false)
    new(raw, strict:, holder:)
  end

  # Field-level merge of a (strict) patch into stored data. A key sent blank
  # clears the field; a key not sent keeps its value. Sections the patch
  # touches get a fresh `touched` timestamp.
  def self.merge(current, patch, now: Time.current)
    base = parse(current, strict: false)
    patch = parse(patch, strict: true) unless patch.is_a?(ProjectSheet)
    merged = base.values.deep_dup
    patch.values.each do |section, fields|
      merged[section] = (merged[section] || {}).merge(fields).compact
      merged.delete(section) if merged[section].empty?
    end
    meta = base.meta.deep_dup
    meta["done"] = patch.meta["done"] if patch.meta.key?("done")
    meta["done"] = (meta["done"] || []).presence
    touched = (meta["touched"] || {}).dup
    patch.values.each_key { |section| touched[section] = now.utc.iso8601 }
    patch.meta["done"]&.each { |section| touched[section] ||= now.utc.iso8601 }
    meta["touched"] = touched
    identify_functions!(merged["analysis"], base.values["analysis"]) if merged["analysis"]
    new({ **merged, "meta" => meta.compact }, strict: false)
  end

  # Gives every function of the analysis a stable id: the one it was sent
  # with, else the one of the function of the same name already stored (an
  # AI or a form that resends the list keeps the links of the map's
  # elements), else a new one.
  def self.identify_functions!(analysis, before)
    known = FUNCTION_LISTS.keys.flat_map { |list| Array(before&.dig(list)) }
      .select { _1["id"].present? }.to_h { [ _1["name"].to_s.downcase.squish, _1["id"] ] }
    taken = Set.new
    FUNCTION_LISTS.each_key do |list|
      next unless analysis[list].is_a?(Array)
      analysis[list] = analysis[list].map do |row|
        id = row["id"].presence
        id = nil if id && taken.include?(id)
        id ||= known[row["name"].to_s.downcase.squish]
        id = nil if id && taken.include?(id)
        id ||= "f#{SecureRandom.alphanumeric(8).downcase}"
        taken << id
        row.merge("id" => id)
      end
    end
  end

  # Merges a (strict, valid) patch into the map's sheet and saves it, under a
  # row lock so two autosaves never lose each other's fields.
  def self.save!(map, patch)
    sheet = nil
    map.with_lock do
      sheet = merge(map.project, patch)
      map.update!(project: sheet.to_h)
    end
    sheet
  end

  def self.fields_for(section, holder: false)
    fields = SECTIONS.fetch(section)
    holder ? fields.reject(&:team_only) : fields
  end

  # For the frontend: the whole declaration, in display order. `holder`:
  # without the team-only fields (the private link's form).
  def self.schema_json(holder: false)
    sections = SECTIONS.keys.filter_map do |key|
      fields = fields_for(key, holder:)
      next if fields.empty?
      { key:, fields: fields.map(&:as_json), teamOnly: (true if team_section?(key)) }.compact
    end
    { sections: }
  end

  # A section only the people working on the map fill (the functional analysis).
  def self.team_section?(section) = SECTIONS.fetch(section).all?(&:team_only)

  def initialize(raw, strict: true, holder: false)
    coercer = TypedSchema::Coercer.new(strict:)
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    raw = {} if raw.nil?
    raw = raw.deep_stringify_keys if raw.is_a?(Hash)
    @values = {}
    @meta = {}
    if raw.is_a?(Hash)
      SECTIONS.each_key do |section|
        next unless raw.key?(section)
        @values[section] = coercer.hash(self.class.fields_for(section, holder:), raw[section], section)
      end
      @meta = read_meta(coercer, raw["meta"])
    else
      coercer.errors[""] = :not_a_hash if strict
    end
    @errors = coercer.errors
    @values.reject! { |_, fields| fields.empty? }
  end

  def valid? = errors.empty?

  # Normalised storage form: blanks removed, empty sections removed.
  def to_h
    sections = values.transform_values(&:compact).reject { |_, fields| fields.empty? }
    meta_h = meta.compact_blank
    meta_h.empty? ? sections : sections.merge("meta" => meta_h)
  end

  def section(name) = values.fetch(name, {}).compact

  # The sheet without its personal data (phones, e-mails, health): what a
  # dossier, an export or an AI may read. Same shape as #to_h.
  def without_personal
    to_h.to_h do |name, fields|
      next [ name, fields ] if name == "meta"
      definitions = SECTIONS.fetch(name).index_by(&:key)
      kept = fields.filter_map do |key, value|
        field = definitions[key]
        next if field.nil? || field.personal
        value = value.map { |row| row.except(*self.class.personal_keys(field)) } if field.type == :list && value.is_a?(Array)
        [ key, value ]
      end.to_h
      [ name, kept ]
    end.reject { |name, fields| name != "meta" && fields.empty? }
  end

  # Keys of a list's entries that are personal.
  def self.personal_keys(field) = Array(field.item).select(&:personal).map(&:key)

  # A field that holds personal data, in itself or in its entries.
  def self.personal?(field) = field.personal || personal_keys(field).any?

  # An AI never sees personal data, so an answer it proposes for a list
  # (« people », « tasters ») comes without it: entries of the new list keep
  # the personal values of the current entry with the same name.
  def self.keep_personal(field, current, proposed)
    keys = personal_keys(field)
    return proposed if keys.empty? || !proposed.is_a?(Array) || !current.is_a?(Array)
    by_name = current.index_by { _1["name"].to_s.strip.downcase }
    proposed.map do |row|
      before = by_name[row["name"].to_s.strip.downcase]
      before ? before.slice(*keys).merge(row.except(*keys)) : row.except(*keys)
    end
  end

  # The functions of the analysis, people's then place's: { id, name, source }.
  def project_functions
    FUNCTION_LISTS.flat_map do |list, source|
      Array(section("analysis")[list]).filter_map { |row| { id: row["id"], name: row["name"], source: } if row["id"].present? }
    end
  end

  # The challenges the place itself raises: what to go and look at on the land.
  def place_challenges
    Array(section("analysis")["challenges"]).select { _1["origin"] == "place" }.map { _1["name"] }
  end

  # The sheet as the people behind the project see it on their private link.
  def for_holder = self.class.parse(to_h, strict: false, holder: true)

  def done?(section) = Array(meta["done"]).include?(section)

  # Completion: per section the share of "counting" fields that have an
  # answer (free text never counts), 100 when the person marked the section
  # as done. The sheet's percent is the mean of its sections.
  # holder: as the people behind the project see it on their private link,
  # without the sections only the team fills.
  def progress(holder: false)
    names = holder ? SECTIONS.keys.reject { self.class.team_section?(_1) } : SECTIONS.keys
    sections = names.to_h do |name|
      fields = self.class.fields_for(name, holder:)
      counting = fields.select(&:counts)
      answered = counting.count { |f| TypedSchema.answered?(section(name)[f.key]) }
      total = counting.size
      done = done?(name)
      percent = done || total.zero? ? 100 : (100.0 * answered / total).round
      status = percent >= 100 ? "complete" : (answered.positive? ? "partial" : "empty")
      [ name, { percent:, answered:, total:, done:, status:, touchedAt: meta.dig("touched", name) } ]
    end
    next_section = sections.find { |_, s| s[:status] != "complete" }&.first
    percent = (sections.values.sum { |s| s[:percent] } / sections.size.to_f).round
    { percent:, sections:, nextSection: next_section }
  end

  private
    def read_meta(coercer, raw)
      return {} unless raw.is_a?(Hash)
      meta = {}
      meta["done"] = coercer.value(META_FIELDS.first, raw["done"], "meta.done") if raw.key?("done")
      if raw["touched"].is_a?(Hash)
        meta["touched"] = raw["touched"].slice(*SECTIONS.keys).select { |_, time| valid_time?(time) }
      end
      meta # a nil "done" means "cleared" for a patch; to_h compacts it
    end

    def valid_time?(value)
      value.is_a?(String) && Time.zone.parse(value).present?
    rescue ArgumentError
      false
    end
end
