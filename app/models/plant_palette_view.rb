# A table view of a map's « Palette végétale », saved by its editors: which
# columns, how rows are grouped, sorted and filtered. Every map also has the
# built-in views of config/plant_palette.yml (`PRESETS`), which people
# duplicate to make their own.
#
#   settings = { "columns" => ["name", "planned"], "group_by" => "strata",
#                "sort" => { "key" => "name", "dir" => "asc" },
#                "filters" => { "statuses" => ["planned"], "strata" => [], "roles" => [],
#                               "tag" => "Chantier mars", "untagged" => false, "supplier" => nil, "search" => nil,
#                               "to_plant_only" => true } }
class PlantPaletteView < ApplicationRecord
  CONFIG = YAML.load_file(Rails.root.join("config/plant_palette.yml")).freeze
  COLUMNS = CONFIG.fetch("columns").freeze
  GROUPS = CONFIG.fetch("groups").freeze
  STATUSES = CONFIG.fetch("statuses").freeze
  PRESETS = CONFIG.fetch("presets").freeze
  ROLES = PaletteItem::ROLES
  STRATA = PlantVocabulary::STRATA
  MAX_VIEWS = 30

  belongs_to :map, touch: true
  belongs_to :created_by, class_name: "User", optional: true

  validates :name, presence: true, length: { maximum: 80 }
  validate :not_too_many, on: :create

  normalizes :name, with: ->(name) { name.to_s.squish }

  before_validation { self.settings = self.class.clean_settings(settings) }
  before_create { self.position = (PlantPaletteView.where(map_id:).maximum(:position) || 0) + 1 if position.zero? }

  scope :ordered, -> { order(:position, :id) }

  # Keeps only what the table understands, so a stale or forged view never
  # breaks the page: unknown columns, groups and filters are dropped.
  def self.clean_settings(raw)
    raw = (raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h).deep_stringify_keys
    columns = Array(raw["columns"]).map(&:to_s) & COLUMNS
    columns = [ "name" ] + (columns - [ "name" ])
    sort = raw["sort"].is_a?(Hash) ? raw["sort"] : {}
    filters = raw["filters"].is_a?(Hash) ? raw["filters"] : {}
    {
      "columns" => columns,
      "group_by" => GROUPS.include?(raw["group_by"].to_s) ? raw["group_by"].to_s : "none",
      "sort" => {
        "key" => COLUMNS.include?(sort["key"].to_s) ? sort["key"].to_s : "name",
        "dir" => sort["dir"].to_s == "desc" ? "desc" : "asc"
      },
      "filters" => {
        "statuses" => Array(filters["statuses"]).map(&:to_s) & STATUSES,
        "strata" => Array(filters["strata"]).map(&:to_s) & STRATA,
        "roles" => Array(filters["roles"]).map(&:to_s) & ROLES,
        # `untagged`: only the plants without any tag (jsonb refuses the
        # NUL of UNTAGGED in tags.ts, so the page translates).
        "tag" => filters["tag"].to_s.delete("\u0000").squish.first(MapFeature::Tags::MAX_LENGTH).presence,
        "untagged" => ActiveModel::Type::Boolean.new.cast(filters["untagged"]) || false,
        "supplier" => filters["supplier"].to_s.squish.first(120).presence,
        "search" => filters["search"].to_s.squish.first(120).presence,
        "to_plant_only" => ActiveModel::Type::Boolean.new.cast(filters["to_plant_only"]) || false
      }
    }
  end

  # The built-in views, in the order of the file, ready for the page.
  def self.presets_json
    PRESETS.map { |key, settings| { key:, name: I18n.t("plant_palette.presets.#{key}"), settings: clean_settings(settings) } }
  end

  def as_json(*)
    { id:, name:, settings:, position: }
  end

  private
    def not_too_many
      errors.add(:base, :too_many_views, count: MAX_VIEWS) if map && PlantPaletteView.where(map_id: map_id).count >= MAX_VIEWS
    end
end
