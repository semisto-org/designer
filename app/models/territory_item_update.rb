# A change an AI proposed to an entry of a territory's dossier that a person
# already kept (MCP propose_territory_updates): a title, a text, a place, or
# some of its attributes (a lead's land, its keeper, a marker's proof). Or
# its removal (propose_territory_deletions). It waits, "pending", until a
# person accepts it, all of it or field by field, rejects it, or the AI
# withdraws or replaces it. An accepted one stays as the entry's history.
#
# `proposed_changes` holds only what differs from the entry, already cleaned
# by the entry's schema (TerritoryItem::SCHEMA):
#   { "title" => "…", "body" => "…", "geometry" => { GeoJSON } | nil,
#     "properties" => { "land" => "public", "keeper" => { "role" => "…" }, "magnitude" => nil } }
# where nil removes a value; or, for a removal, only { "delete" => true }.
class TerritoryItemUpdate < ApplicationRecord
  STATUSES = %w[pending accepted rejected withdrawn].freeze
  FIELDS = %w[title body geometry properties].freeze
  DELETION = { "delete" => true }.freeze

  belongs_to :territory
  belongs_to :territory_item, optional: true
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :reviewed_by, class_name: "User", optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :batch, :rationale, :item_title, presence: true
  validate :changes_shape

  scope :pending, -> { where(status: "pending").where.not(territory_item_id: nil) }

  def pending? = status == "pending"
  def self.deletion?(changes) = changes.respond_to?(:to_h) && changes.to_h.deep_stringify_keys == DELETION
  def deletion? = self.class.deletion?(proposed_changes)

  # Checks and cleans what an AI asks to change on `item`. Returns
  # [changes, nil] with only what differs from the entry, or [nil, error].
  def self.normalize(item, changes)
    changes = changes.to_h.deep_stringify_keys
    return [ nil, err(:empty) ] if changes.empty?
    unknown = changes.keys - FIELDS
    return [ nil, err(:fields, fields: unknown.join(", "), allowed: FIELDS.join(", ")) ] if unknown.any?
    out = {}
    if changes.key?("title")
      title = changes["title"].to_s.squish
      return [ nil, err(:title, max: TerritoryItem::TITLE_MAX_LENGTH) ] unless title.length.between?(2, TerritoryItem::TITLE_MAX_LENGTH)
      out["title"] = title
    end
    if changes.key?("body")
      return [ nil, err(:text, field: "body") ] unless changes["body"].nil? || changes["body"].is_a?(String)
      out["body"] = changes["body"].to_s.strip.first(TerritoryItem::BODY_MAX_LENGTH).presence
    end
    if changes.key?("geometry")
      out["geometry"] = changes["geometry"].presence
      if out["geometry"]
        begin
          out["geometry"] = RGeo::GeoJSON.encode(TerritoryItem.parse_geojson(out["geometry"]))
        rescue RGeo::Error::ParseError, JSON::ParserError, NoMethodError, ArgumentError
          return [ nil, err(:geometry) ]
        end
      end
    end
    if changes.key?("properties")
      return [ nil, err(:properties) ] unless changes["properties"].is_a?(Hash) && changes["properties"].any?
      properties, error = clean_properties(TerritoryItem::SCHEMA.fetch(item.kind, {}), changes["properties"], item.kind)
      return [ nil, error ] if error
      out["properties"] = properties
    end
    [ only_differences(item, out), nil ]
  end

  # Each key must belong to the kind, each value fit its type; nil removes.
  def self.clean_properties(schema, raw, path)
    raw.each_with_object({}) do |(key, value), out|
      type = schema[key]
      return [ nil, err(:property, key:, kind: path, allowed: schema.keys.join(", ")) ] unless type
      if value.nil?
        out[key] = nil
      elsif type.is_a?(Hash)
        return [ nil, err(:group, key:) ] unless value.is_a?(Hash)
        nested, error = clean_properties(type, value, "#{path}.#{key}")
        return [ nil, error ] if error
        out[key] = nested
      else
        cleaned = TerritoryItem.clean_value(type, value)
        if cleaned.nil? || cleaned == [] || cleaned == ""
          return [ nil, type.is_a?(Array) ? err(:value_in, key:, allowed: type.join(", ")) : err(:value, key:, type: type.to_s) ] unless value == "" || value == []
          cleaned = nil
        end
        out[key] = cleaned
      end
    end.then { |out| [ out, nil ] }
  end

  # Field by field: [ [ "properties.keeper.role", "…" ], [ "title", "…" ] ].
  def self.leaves(changes, prefix = nil)
    changes.to_h.flat_map do |key, value|
      path = [ prefix, key ].compact.join(".")
      if (prefix || key == "properties") && key != "geometry" && value.is_a?(Hash)
        leaves(value, path)
      else
        [ [ path, value ] ]
      end
    end
  end

  def self.unflatten(leaves)
    leaves.each_with_object({}) do |(path, value), out|
      *parents, last = path.split(".")
      parents.inject(out) { |node, key| node[key] ||= {} }[last] = value
    end
  end

  # The value of one field of the entry as it is now.
  def self.current(item, path)
    case path
    when "title" then item.title
    when "body" then item.body
    when "geometry" then item.geometry && RGeo::GeoJSON.encode(item.geometry)
    else item.properties.dig(*path.split(".").drop(1))
    end
  end

  # Writes one field on the entry, in memory; nil removes a value.
  def self.assign(item, path, value)
    case path
    when "title" then item.title = value
    when "body" then item.body = value
    when "geometry" then item.geometry = value
    else
      properties = item.properties.deep_dup
      *parents, last = path.split(".").drop(1)
      node = parents.inject(properties) { |h, key| h[key] = h[key].is_a?(Hash) ? h[key] : {} }
      value.nil? ? node.delete(last) : node[last] = value
      item.properties = properties
    end
  end

  def self.only_differences(item, changes)
    unflatten(leaves(changes).reject { |path, value| current(item, path) == value })
  end

  # Before → after, field by field, against the entry as it is now.
  def diff(item = territory_item)
    return [ { field: "delete", before: nil, after: true } ] if deletion?
    self.class.leaves(proposed_changes).map { |path, after| { field: path, before: item && self.class.current(item, path), after: } }
  end

  # Applies the chosen fields (all of them by default) to the entry and marks
  # the proposal accepted. Raises ActiveRecord::RecordInvalid when the entry
  # would not be valid; the caller wraps it in a transaction. A removal
  # deletes the entry, as « Retirer » does.
  def accept!(user, fields: nil)
    return accept_deletion!(user) if deletion?
    item = territory_item.reload
    chosen = self.class.leaves(proposed_changes)
    chosen = chosen.select { |path, _| fields.include?(path) } if fields
    raise ArgumentError, "no field chosen" if chosen.empty?
    previous = chosen.to_h { |path, _| [ path, self.class.current(item, path) ] }
    chosen.each { |path, value| self.class.assign(item, path, value) }
    item.save!
    update!(status: "accepted", reviewed_by: user, reviewed_at: Time.current, applied_changes: self.class.unflatten(chosen), previous_values: previous)
    item
  end

  def reject!(user)
    update!(status: "rejected", reviewed_by: user, reviewed_at: Time.current)
  end

  def as_review_json(item = territory_item)
    {
      id:, rationale:, deletion: deletion?, clientName: client_name, authorName: created_by&.display_name,
      changes: diff(item), createdAt: created_at.iso8601
    }
  end

  def self.err(key, **options) = I18n.t("mcp.territory_update_errors.#{key}", **options)

  private
    def accept_deletion!(user)
      item = territory_item
      update!(status: "accepted", reviewed_by: user, reviewed_at: Time.current, applied_changes: DELETION,
              previous_values: { "kind" => item.kind, "title" => item.title })
      item.destroy!
      nil
    end

    def changes_shape
      return if deletion?
      unless proposed_changes.is_a?(Hash) && proposed_changes.any? && (proposed_changes.keys - FIELDS).empty?
        errors.add(:proposed_changes, :invalid)
      end
    end
end
