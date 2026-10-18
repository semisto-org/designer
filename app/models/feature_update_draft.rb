# A change an AI proposed to an element already on the map (through the MCP
# tool propose_feature_updates): a planting date, a species, a name, tags,
# notes, a position. It waits, "pending", until a person accepts it (maybe
# after adjusting it), rejects it, or the AI withdraws or replaces it. An
# accepted one stays as the element's history: who proposed it, who
# accepted it and when, what it replaced.
#
# `proposed_changes` holds only what differs from the element when it was
# proposed, already normalized:
#   { "name" => "…", "notes" => "…", "tags" => [ … ],
#     "properties" => { "planted_on" => "2026-05-23", "count" => nil },   # nil removes the key
#     "geometry" => { GeoJSON } }
class FeatureUpdateDraft < ApplicationRecord
  STATUSES = %w[pending accepted rejected withdrawn].freeze
  FIELDS = %w[name notes tags properties geometry].freeze

  belongs_to :map
  belongs_to :map_feature
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :reviewed_by, class_name: "User", optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :batch, :rationale, presence: true
  validate :changes_shape

  scope :pending, -> { where(status: "pending") }
  scope :reviewed, -> { where(status: %w[accepted rejected]) }
  scope :ordered, -> { order(:id) }

  def pending? = status == "pending"

  # Writes `changes` (FIELDS, properties merged key by key, nil removing a
  # key) on the feature, in memory.
  def self.assign(feature, changes)
    changes = changes.to_h.deep_stringify_keys
    feature.name = changes["name"] if changes.key?("name")
    feature.notes = changes["notes"] if changes.key?("notes")
    feature.tags = Array(changes["tags"]) if changes.key?("tags")
    if changes["properties"].is_a?(Hash)
      merged = feature.properties.to_h.dup
      changes["properties"].each { |key, value| value.nil? ? merged.delete(key) : merged[key] = value }
      feature.properties = merged
    end
    feature.geometry = changes["geometry"] if changes["geometry"].present?
    feature
  end

  # The current values of the fields `changes` touches, in the same shape.
  def self.snapshot(feature, changes)
    changes = changes.to_h.deep_stringify_keys
    changes.each_with_object({}) do |(field, value), out|
      out[field] =
        case field
        when "properties" then value.to_h.keys.index_with { |key| feature.properties.to_h[key] }
        when "geometry" then feature.geometry && RGeo::GeoJSON.encode(feature.geometry)
        when "tags" then Array(feature.tags)
        else feature.public_send(field)
        end
    end
  end

  # Field by field, before → after, against the element as it is now:
  #   [ { field: "properties.planted_on", before: nil, after: "2026-05-23" }, … ]
  def self.diff(feature, changes)
    before = snapshot(feature, changes)
    changes.to_h.deep_stringify_keys.flat_map do |field, value|
      if field == "properties"
        value.to_h.map { |key, after| { field: "properties.#{key}", before: before["properties"][key], after: } }
      else
        [ { field:, before: before[field], after: value } ]
      end
    end
  end

  def diff(feature = map_feature) = self.class.diff(feature, proposed_changes)

  # Applies the proposal (or the person's adjustment of its values) to the
  # element and marks it accepted. Raises ActiveRecord::RecordInvalid when
  # the element would not be valid; the caller wraps it in a transaction.
  def accept!(user, adjusted = nil)
    changes = adjusted ? adjust(adjusted) : proposed_changes
    # Fresh: accepting an earlier change of the same proposal may have given
    # this element another plant number (a swap), which bumped its lock.
    feature = map_feature.reload
    previous = self.class.snapshot(feature, changes)
    self.class.assign(feature, changes)
    # A new plant number is a swap: the plant holding it takes the one this
    # plant leaves (MapFeature::PlantNumber).
    feature.swap_number = changes["properties"].is_a?(Hash) && changes["properties"].key?("number")
    feature.updated_by = user
    feature.save!
    update!(status: "accepted", reviewed_by: user, reviewed_at: Time.current, applied_changes: changes, previous_values: previous)
    feature
  end

  def reject!(user)
    update!(status: "rejected", reviewed_by: user, reviewed_at: Time.current)
  end

  def as_review_json(feature = map_feature)
    {
      id:, featureId: map_feature_id, batch:, summary:, rationale:, status:,
      clientName: client_name, authorName: created_by&.display_name,
      changes: self.class.labeled(diff(feature)), proposedChanges: proposed_changes, createdAt: created_at.iso8601
    }
  end

  # An accepted or rejected proposal, as the element's history shows it.
  def as_history_json
    shown = status == "accepted" ? applied_changes : proposed_changes
    before = previous_values || {}
    changes = shown.to_h.flat_map do |field, value|
      if field == "properties"
        value.to_h.map { |key, after| { field: "properties.#{key}", before: before.dig("properties", key), after: } }
      else
        [ { field:, before: before[field], after: value } ]
      end
    end
    {
      id:, status:, rationale:, summary:, clientName: client_name, authorName: created_by&.display_name,
      reviewerName: reviewed_by&.display_name, reviewedAt: reviewed_at&.iso8601, createdAt: created_at.iso8601,
      adjusted: status == "accepted" && applied_changes != proposed_changes, changes: self.class.labeled(changes)
    }
  end

  # Adds readable names next to catalogue ids (species, variety) in a diff,
  # for the person reviewing it.
  def self.labeled(diff)
    ids = ->(field) { diff.select { |c| c[:field] == field }.flat_map { |c| [ c[:before], c[:after] ] }.compact.map(&:to_i) }
    species = PlantSpecies.where(id: ids.("properties.species_id")).includes(:common_names).index_by(&:id)
    varieties = PlantVariety.where(id: ids.("properties.variety_id")).includes(:species).index_by(&:id)
    name = lambda do |field, value|
      return nil if value.nil?
      case field
      when "properties.species_id" then species[value.to_i]&.then { |s| [ s.common_name, s.latin_name ].compact.uniq.join(" · ") }
      when "properties.variety_id" then varieties[value.to_i]&.full_latin_name
      when "properties.training" then I18n.t("plant_feature.trainings.#{value}", default: nil)
      when "properties.graft_form" then I18n.t("plant_feature.graft_form_names.#{value}", default: nil)
      when "properties.rootstock_vigor" then I18n.t("plant_feature.vigor_names.#{value}", default: nil)
      when "properties.planted_on_precision" then I18n.t("feature_updates.precisions.#{value}", default: nil)
      end
    end
    diff.map { |c| c.merge({ beforeLabel: name.(c[:field], c[:before]), afterLabel: name.(c[:field], c[:after]) }.compact) }
  end

  private
    # Only the fields (and property keys) the AI proposed can be adjusted.
    def adjust(adjusted)
      adjusted = adjusted.to_h.deep_stringify_keys
      proposed_changes.each_with_object({}) do |(field, value), out|
        if field == "properties"
          values = adjusted["properties"].is_a?(Hash) ? adjusted["properties"] : {}
          out[field] = value.to_h.to_h { |key, v| [ key, values.key?(key) ? values[key].presence : v ] }
        else
          out[field] = adjusted.key?(field) ? adjusted[field] : value
        end
      end
    end

    def changes_shape
      unless proposed_changes.is_a?(Hash) && proposed_changes.any? && (proposed_changes.keys - FIELDS).empty?
        errors.add(:proposed_changes, :invalid)
      end
    end
end
