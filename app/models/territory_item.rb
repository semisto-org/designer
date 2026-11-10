# One entry of a territory's dossier. `kind` says what it is:
#
# - actor:       someone already at work on the territory (erosion unit, river
#                contract, municipal officer, farmer). Met first, before any
#                research, so the notebook builds on their work.
# - source:      a document found (by a person or their AI): link, author,
#                date, summary, excerpts, rights, and a copy of the file when
#                its rights allow it.
# - expectation: what the territory already asked for in its own documents,
#                with the sources it comes from.
# - marker:      a dated, locatable fact (a flood in a street, a pond filled
#                in) with its level of proof: computed, seen on site,
#                confirmed by a witness or in the rain. A computed flow line
#                that meets a told flood is a « concordance à vérifier »,
#                never a proof.
# - lead:        a layout lead (« piste d'aménagement »): rank (soil
#                practices first, then slowing water upstream, then
#                structures), theme (water or the food tree), land type,
#                order of magnitude only, the farmer's answer, its keeper
#                and the decision taken on it.
#
# Like map features, an AI proposes items as drafts with a rationale (MCP
# propose_territory_items); a person accepts or rejects them one by one.
class TerritoryItem < ApplicationRecord
  include GeoJsonGeometry

  KINDS = %w[actor source expectation marker lead].freeze
  STATUSES = %w[draft active rejected].freeze
  SOURCES = %w[human ai].freeze
  TITLE_MAX_LENGTH = 200
  BODY_MAX_LENGTH = 20_000
  MAX_FILE_BYTES = 30.megabytes

  PROOFS = %w[computed seen confirmed].freeze
  MARKER_KINDS = %w[flood mudflow erosion lost_pond lost_hedge spring other].freeze
  SOURCE_KINDS = %w[plan council press map study call other].freeze
  RIGHTS = %w[open restricted unknown].freeze
  RANKS = %w[soil slow structure].freeze
  THEMES = %w[water tree].freeze
  LANDS = %w[public agricultural private unknown].freeze
  FARMER_ANSWERS = %w[yes no thinking].freeze
  DECISIONS = %w[retained postponed dismissed].freeze

  # The keys each kind keeps in `properties`, with their type. Anything else
  # is dropped, so neither a form nor an AI can stuff the column.
  SCHEMA = {
    "actor" => { "organization" => :string, "function" => :string, "met_on" => :date, "contact" => :string },
    "source" => { "url" => :url, "author" => :string, "published_on" => :string, "excerpts" => :text,
                  "rights" => RIGHTS, "source_kind" => SOURCE_KINDS },
    "expectation" => { "year" => :integer, "source_ids" => :ids, "validated" => :boolean },
    "marker" => { "occurred_on" => :string, "proof" => PROOFS, "marker_kind" => MARKER_KINDS, "source_ids" => :ids },
    "lead" => {
      "rank" => RANKS, "theme" => THEMES, "land" => LANDS, "magnitude" => :string,
      "expectation_ids" => :ids, "seen_on_site" => :boolean, "seen_on" => :date,
      "farmer" => { "contacted_on" => :date, "answer" => FARMER_ANSWERS, "note" => :string },
      "keeper" => { "role" => :string, "gestures" => :string, "hours_per_year" => :integer, "agreement" => :string, "lifespan_years" => :integer },
      "decision" => { "status" => DECISIONS, "reason" => :string, "decided_on" => :date },
      "first_step" => :integer, "this_winter" => :boolean, "map_id" => :integer
    }
  }.freeze
  STRING_MAX = 500

  belongs_to :territory, touch: true
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :decided_by, class_name: "User", optional: true
  has_one_attached :file

  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :source, inclusion: { in: SOURCES }
  validates :title, presence: true, length: { maximum: TITLE_MAX_LENGTH }
  validates :body, :rationale, length: { maximum: BODY_MAX_LENGTH }
  validates :rationale, presence: true, if: -> { source == "ai" }
  validate :geometry_fits_kind
  validate :file_fits

  normalizes :title, with: ->(t) { t.to_s.squish }
  before_validation :clean_properties

  scope :drafts, -> { where(status: "draft") }
  scope :kept, -> { where(status: "active") }
  scope :not_rejected, -> { where.not(status: "rejected") }
  scope :of_kind, ->(kind) { where(kind:) }

  def self.clean(kind, raw)
    clean_hash(SCHEMA.fetch(kind, {}), raw)
  end

  def self.clean_hash(schema, raw)
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    raw = {} unless raw.is_a?(Hash)
    raw = raw.stringify_keys
    schema.each_with_object({}) do |(key, type), out|
      next unless raw.key?(key)
      value = clean_value(type, raw[key])
      out[key] = value unless value.nil? || value == "" || value == {} || value == []
    end
  end

  def self.clean_value(type, value)
    case type
    when Hash then clean_hash(type, value)
    when Array then value.to_s.presence_in(type)
    when :string then value.to_s.squish.first(STRING_MAX).presence
    when :text then value.to_s.strip.first(BODY_MAX_LENGTH).presence
    when :url then (url = value.to_s.strip).match?(%r{\Ahttps?://\S+\z}i) ? url.first(2000) : nil
    when :date then (Date.iso8601(value.to_s).iso8601 rescue nil)
    when :integer then (Integer(value.to_s, 10) rescue nil)
    when :boolean then value.nil? || value == "" ? nil : ActiveModel::Type::Boolean.new.cast(value)
    when :ids then Array(value).filter_map { |v| Integer(v.to_s, 10) rescue nil }.uniq.first(50)
    end
  end

  def geometry=(value)
    value = self.class.parse_geojson(value) if value.is_a?(Hash) || value.is_a?(String) || value.respond_to?(:to_unsafe_h)
    super(value)
  end

  def draft? = status == "draft"
  def ai? = source == "ai"

  def accept!(user)
    update!(status: "active", decided_by: user, decided_at: Time.current)
  end

  def reject!(user)
    update!(status: "rejected", decided_by: user, decided_at: Time.current)
  end

  def prop(*path) = properties.dig(*path.map(&:to_s))

  # --- leads ---

  # No keeper, no lead: who maintains it in year 8 is where projects die.
  def orphan? = kind == "lead" && prop(:keeper, :role).blank?
  def seen_on_site? = prop(:seen_on_site) == true
  def farmer_answer = prop(:farmer, :answer)
  def farmer_contacted? = prop(:farmer, :contacted_on).present? && farmer_answer.present?

  # Drawn as a sharp outline on public land, or once the farmer (or owner)
  # said yes; a fuzzy zone otherwise.
  def sharp? = prop(:land) == "public" || farmer_answer == "yes"

  # Farmland, or land nobody has named yet (leaving the default never slips
  # a lead past the farmer rule).
  def on_farmland? = %w[agricultural unknown].include?(prop(:land) || "unknown")

  # A soil practice (winter cover, rotation, working across the slope) on
  # farmland: it comes first and names no one, so it reaches the working
  # notebook before the farmer answers, without outline; the public version
  # still waits for their yes.
  def soil_practice? = kind == "lead" && prop(:rank) == "soil" && on_farmland?

  # Any other lead on farmland reaches the collège only once the farmer was
  # met and answered: learning about it from the council sets the fire.
  def waiting_for_farmer? = kind == "lead" && on_farmland? && !soil_practice? && !farmer_contacted?

  def as_inertia
    {
      id:, kind:, status:, source:, title:, body:, rationale:,
      geometry: geometry_geojson,
      properties:,
      file: file.attached? ? { name: file.filename.to_s, byteSize: file.byte_size } : nil,
      orphan: orphan?, sharp: kind == "lead" ? sharp? : nil, waitingForFarmer: waiting_for_farmer?,
      createdAt: created_at.iso8601, updatedAt: updated_at.iso8601, lockVersion: lock_version
    }
  end

  private
    def clean_properties
      self.properties = self.class.clean(kind, properties)
    end

    def geometry_fits_kind
      return if geometry.nil?
      type = geometry.geometry_type
      case kind
      when "marker"
        errors.add(:geometry, :invalid) unless type == RGeo::Feature::Point
      when "lead"
        allowed = [ RGeo::Feature::Point, RGeo::Feature::LineString, RGeo::Feature::Polygon, RGeo::Feature::MultiPolygon, RGeo::Feature::MultiLineString ]
        errors.add(:geometry, :invalid) unless allowed.include?(type)
      else
        errors.add(:geometry, :invalid)
      end
      return if errors.include?(:geometry) || territory.nil?
      near = self.class.connection.select_value(self.class.sanitize_sql_array([
        "SELECT ST_DWithin(ST_GeomFromEWKT(?)::geography, ST_GeomFromEWKT(?)::geography, 5000)",
        "SRID=4326;#{geometry.as_text}", "SRID=4326;#{territory.boundary.as_text}"
      ]))
      errors.add(:geometry, :outside) unless near
    end

    def file_fits
      return unless file.attached?
      errors.add(:file, :invalid) unless kind == "source"
      errors.add(:file, :too_large) if file.byte_size > MAX_FILE_BYTES
    end
end
