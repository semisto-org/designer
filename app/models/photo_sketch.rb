# A sketch drawn over a map photo: hand-drawn lines and handwritten notes,
# to put an idea on the place as it looks today. A photo carries as many
# sketches as there are ideas; the photo itself is never altered.
#
# `strokes` is a list of vector marks in the photo's frame: x and y go from
# 0 to 1 of the image's width and height, and sizes are fractions of its
# width, so a sketch fits the thumbnail, the large view and the original.
#   { "type" => "line", "color" => "#ffffff", "width" => 0.006, "points" => [[0.1, 0.2], ...] }
#   { "type" => "text", "color" => "#ffffff", "size" => 0.04, "x" => 0.5, "y" => 0.5, "text" => "Mare" }
class PhotoSketch < ApplicationRecord
  NAME_MAX = 80
  TEXT_MAX = 200
  MAX_MARKS = 1_000
  MAX_POINTS = 20_000
  COLOR = /\A#\h{6}\z/
  WIDTH_RANGE = (0.0005..0.1).freeze
  TEXT_SIZE_RANGE = (0.005..0.3).freeze
  # Points may stray a little outside the frame when a stroke ends past the edge.
  COORD_RANGE = (-0.1..1.1).freeze

  belongs_to :map
  belongs_to :photo, class_name: "MapPhoto", foreign_key: :map_photo_id, inverse_of: :sketches
  belongs_to :created_by, class_name: "User", optional: true

  normalizes :name, with: ->(name) { name.squish }

  before_validation :inherit_map, on: :create

  validates :name, presence: true, length: { maximum: NAME_MAX }
  validate :strokes_are_well_formed
  validate :photo_belongs_to_map

  scope :ordered, -> { order(:created_at, :id) }

  def as_inertia
    {
      id:, photoId: map_photo_id, name:, strokes:, lockVersion: lock_version,
      createdBy: created_by&.display_name, createdAt: created_at.iso8601, updatedAt: updated_at.iso8601
    }
  end

  private
    def inherit_map
      self.map_id ||= photo&.map_id
    end

    def photo_belongs_to_map
      errors.add(:base, I18n.t("photo_sketches.errors.photo_elsewhere")) if photo && map_id && photo.map_id != map_id
    end

    def strokes_are_well_formed
      return errors.add(:strokes, I18n.t("photo_sketches.errors.invalid")) unless strokes.is_a?(Array)
      return errors.add(:strokes, I18n.t("photo_sketches.errors.too_many", max: MAX_MARKS)) if strokes.size > MAX_MARKS
      points = 0
      strokes.each do |mark|
        valid = case mark.is_a?(Hash) && mark["type"]
        when "line"
          points += mark["points"].is_a?(Array) ? mark["points"].size : 0
          valid_line?(mark)
        when "text" then valid_text?(mark)
        else false
        end
        return errors.add(:strokes, I18n.t("photo_sketches.errors.invalid")) unless valid
      end
      errors.add(:strokes, I18n.t("photo_sketches.errors.too_many", max: MAX_MARKS)) if points > MAX_POINTS
    end

    def valid_line?(mark)
      mark.keys.sort == %w[color points type width] &&
        color?(mark["color"]) && within?(mark["width"], WIDTH_RANGE) &&
        mark["points"].is_a?(Array) && mark["points"].any? &&
        mark["points"].all? { |point| point.is_a?(Array) && point.size == 2 && point.all? { |c| within?(c, COORD_RANGE) } }
    end

    def valid_text?(mark)
      mark.keys.sort == %w[color size text type x y] &&
        color?(mark["color"]) && within?(mark["size"], TEXT_SIZE_RANGE) &&
        within?(mark["x"], COORD_RANGE) && within?(mark["y"], COORD_RANGE) &&
        mark["text"].is_a?(String) && mark["text"].strip.present? && mark["text"].size <= TEXT_MAX
    end

    def color?(value) = value.is_a?(String) && value.match?(COLOR)
    def within?(value, range) = value.is_a?(Numeric) && range.cover?(value)
end
