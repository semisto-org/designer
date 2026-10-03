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

  SECTIONS = {
    # Qui : une ou plusieurs personnes.
    "who" => [
      TypedSchema.list("people", [
        TypedSchema.text("name", limit: 80, required: true),
        TypedSchema.enum("role", *%w[lead partner family friend collective employee other]),
        TypedSchema.text("note", limit: 200)
      ], max: 12),
      TypedSchema.enum("profile", *%w[individual collective school business farm commune other]),
      TypedSchema.enum("experience", *%w[beginner some experienced professional]),
      NOTES
    ],
    # Ambitions et objectifs.
    "ambitions" => [
      TypedSchema.multi("goals", *%w[food_autonomy biodiversity income education hospitality landscape climate_resilience soil_water wood_energy wellbeing]),
      TypedSchema.enum("main_goal", *%w[food_autonomy biodiversity income education hospitality landscape climate_resilience soil_water wood_energy wellbeing]),
      NOTES
    ],
    # Usages souhaités.
    "uses" => [
      TypedSchema.multi("uses", *%w[eat_fresh preserve forage_walk children_play relax gatherings work_outdoors teaching guests market_sales animals_care wood_craft medicinal wildlife_watch]),
      TypedSchema.enum("presence", *%w[daily several_per_week weekends holidays remote]),
      NOTES
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
      NOTES
    ]
  }.each_value(&:freeze).freeze

  META_FIELDS = [ TypedSchema.multi("done", *SECTIONS.keys) ].freeze

  attr_reader :values, :errors, :meta

  # raw: a Hash, ActionController::Parameters, nil (an empty sheet).
  # strict: record an error for every invalid value (input) instead of
  # silently dropping it (reading stored data).
  def self.parse(raw, strict: true)
    new(raw, strict:)
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
    new({ **merged, "meta" => meta.compact }, strict: false)
  end

  def self.fields_for(section) = SECTIONS.fetch(section)

  # For the frontend: the whole declaration, in display order.
  def self.schema_json
    { sections: SECTIONS.map { |key, fields| { key:, fields: fields.map(&:as_json) } } }
  end

  def initialize(raw, strict: true)
    coercer = TypedSchema::Coercer.new(strict:)
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    raw = {} if raw.nil?
    raw = raw.deep_stringify_keys if raw.is_a?(Hash)
    @values = {}
    @meta = {}
    if raw.is_a?(Hash)
      SECTIONS.each do |section, fields|
        next unless raw.key?(section)
        @values[section] = coercer.hash(fields, raw[section], section)
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

  def done?(section) = Array(meta["done"]).include?(section)

  # Completion: per section the share of "counting" fields that have an
  # answer (free text never counts), 100 when the person marked the section
  # as done. The sheet's percent is the mean of its sections.
  def progress
    sections = SECTIONS.to_h do |name, fields|
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
