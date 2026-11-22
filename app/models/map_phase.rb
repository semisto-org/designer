# A design phase put away (« rangée »): the project as it stood when the
# designer closed one stage of the design (« Esquisse », « Avant-projet »…)
# to start the next on the same map. The elements are frozen as GeoJSON,
# as they were drawn, so the phase can be reopened read-only, compared with
# the map of today and an element taken back from it. Only its name and
# notes change afterwards.
class MapPhase < ApplicationRecord
  MAX_PER_MAP = 30
  # What a phase keeps: the design and what is already there, not the
  # visit notes and season signs (they belong to the place, not to a phase).
  SKIPPED_LAYERS = %w[notes].freeze
  # ...except the freehand sketches: for a designer who draws with a pencil,
  # they are the design of that phase.
  KEPT_NOTE_KINDS = %w[sketch].freeze
  # Never copied back from a snapshot: the map gives these again.
  NOT_TAKEN = %w[id lockVersion updatedAt status source rationale variant_id number phase_id layer kind name notes style tags].freeze
  # What happened on the ground since (planting, measures, checks, photos)
  # and links to other elements stay with the original: a copy taken back
  # is the idea, back in the project, not the tree that was planted.
  GROUND_KEYS = /\A(planted|measured|measure|verified|verification|gps|seen|removed|to_remove|health|proof|taken_at|occurred|observed|photo|height_m|trunk|crown_m|looks|look_|died|death|replaced)/
  KEPT_IDS = %w[species_id variety_id rootstock_id].freeze

  belongs_to :map, touch: true
  belongs_to :created_by, class_name: "User", optional: true

  validates :name, presence: true, length: { maximum: 60 }
  validates :notes, length: { maximum: 4_000 }
  validates :number, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: :map_id }
  validate :within_limit, on: :create

  normalizes :name, with: ->(n) { n.to_s.squish }
  normalizes :notes, with: ->(n) { n.to_s.strip.presence }

  scope :ordered, -> { order(:number) }
  # The list of phases, without the frozen elements (a phase can hold thousands).
  scope :listed, -> { select(column_names - %w[snapshot]) }

  # Puts the phase in progress away under `name` and opens the next one
  # (`next_name`, or « Phase n »). Returns the phase put away.
  def self.put_away!(map, name:, notes: nil, next_name: nil, by: nil)
    transaction do
      map.lock!
      # Every variant of its time: each designer's sketch, each proposal.
      features = kept(map.features.active).order(:id).to_a
      retained = map.variants.retained.first&.id
      counted = features.select { |f| f.variant_id.nil? || f.variant_id == retained }
      own = features.reject { _1.variant_id.nil? }.group_by(&:variant_id).transform_values(&:size)
      phase = map.phases.create!(
        number: (map.phases.maximum(:number) || 0) + 1,
        name: name.presence || map.current_design_phase_name,
        notes:, snapshot: features.map(&:as_geojson), counts: count(counted).merge("keeps_sketches" => true), created_by: by,
        variants: map.variants.includes(:created_by).map { |v| v.as_json.except(:position).merge(own: own[v.id].to_i).deep_stringify_keys }
      )
      # Not a change of the map the editor holds: its lock version stays.
      map.update_columns(design_phase_name: next_name.to_s.squish.first(60).presence || I18n.t("design_phases.default_name", number: phase.number + 1), updated_at: Time.current)
      phase
    end
  end

  # What of a map a phase keeps (and compares with).
  def self.kept(scope, sketches: true)
    others = scope.where.not(layer: SKIPPED_LAYERS)
    sketches ? others.or(scope.where(layer: SKIPPED_LAYERS, kind: KEPT_NOTE_KINDS)) : others
  end

  # Phases put away before pencil strokes were kept never held them: a
  # stroke is not « added since » to those.
  def keeps_sketches? = counts.to_h["keeps_sketches"] == true

  def self.count(features)
    tally = ->(list) { planned = list.count(&:planned?); { "planned" => planned, "existing" => list.size - planned } }
    tally.(features).merge(
      "by_layer" => features.group_by(&:layer).transform_values(&:size),
      # The same without the networks, for anyone who may not see them (an AI, a viewer).
      "without_networks" => tally.(features.reject { _1.layer == "networks" })
    )
  end

  # The counts with the networks left out, for an AI or a public view.
  def counts_without_networks
    c = counts.to_h
    base = c["without_networks"] || { "planned" => c["planned"], "existing" => c["existing"] }
    base.merge("by_layer" => (c["by_layer"] || {}).except("networks"))
  end

  # How the map of today differs from this phase, element by element: the
  # ones drawn since (added), the ones gone since (removed: their id in the
  # phase) and the ones moved or changed since (changed).
  #
  # A phase keeps every variant of its time; one is compared at a time
  # (`variant_id`, by default the one retained then): the common project
  # and that variant's own, then and now.
  def compare(current = nil, variant_id: retained_variant_id)
    current ||= today(variant_id)
    kept = features_of(variant_id).to_h { |f| [ f["id"], f.dig("properties", "lockVersion") ] }
    now = current.pluck(:id, :lock_version).to_h
    {
      added: (now.keys - kept.keys).sort,
      removed: (kept.keys - now.keys).sort,
      changed: (kept.keys & now.keys).select { |id| kept[id] != now[id] }.sort
    }
  end

  # The variant retained when the phase was put away (nil: there were none).
  def retained_variant_id
    Array(variants).find { _1["retained"] }&.dig("id")
  end

  # The phase as seen in one of its variants: the common project and that
  # variant's own elements (every element when the phase kept no variant).
  def features_of(variant_id)
    return snapshot if Array(variants).empty? && variant_id.nil?

    snapshot.select do |f|
      own = f.dig("properties", "variant_id")
      own.nil? || own == variant_id
    end
  end

  # Today's elements to compare with that variant: it, if it still
  # exists, else the project the map counts now.
  def today(variant_id)
    scope = self.class.kept(map.features.active, sketches: keeps_sketches?)
    if variant_id && map.variants.exists?(variant_id)
      scope.where(variant_id: [ nil, variant_id ])
    else
      scope.in_design
    end
  end

  # A copy of one of the phase's elements, back on the map as a new element.
  def take!(feature_id, by: nil)
    kept = snapshot.find { |f| f["id"] == feature_id.to_i }
    raise ActiveRecord::RecordNotFound, "Element #{feature_id} is not in this phase" unless kept

    props = kept["properties"] || {}
    properties = props.except(*NOT_TAKEN).reject { |key, _| key.match?(GROUND_KEYS) || (key.end_with?("_id", "_ids") && !KEPT_IDS.include?(key)) }
    properties["planned"] = true if MapFeature.plannable?(props["layer"], props["kind"])
    map.features.create!(
      layer: props["layer"], kind: props["kind"], name: props["name"], notes: props["notes"],
      geometry: kept["geometry"], style: props["style"] || {}, tags: props["tags"] || [], source: "human",
      # Back in its variant when that variant is still there, else in the common project.
      variant: map.variants.find_by(id: props["variant_id"]),
      properties:, created_by: by, updated_by: by
    )
  end

  def as_json(options = nil)
    full = options.is_a?(Hash) && options[:snapshot]
    {
      id:, number:, name:, notes:, counts: counts_without_networks, putAwayAt: created_at&.iso8601, putAwayBy: created_by&.display_name,
      variants: Array(variants).presence, keepsSketches: keeps_sketches? || nil,
      snapshot: (full ? { type: "FeatureCollection", features: snapshot } : nil)
    }.compact
  end

  private
    def within_limit
      errors.add(:base, :too_many, count: MAX_PER_MAP) if map && map.phases.count >= MAX_PER_MAP
    end
end
